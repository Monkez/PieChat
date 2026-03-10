/**
 * Redis persistence layer for auth state.
 * Gracefully degrades to no-op when Redis is unavailable.
 */

import { createClient, type RedisClientType } from 'redis';
import type { LoginEvent } from './phone-otp.js';

let redisClient: RedisClientType | null = null;
let redisReady = false;
let redisConnecting = false;

function getRedisUrl(): string {
    return process.env.REDIS_URL || '';
}

async function ensureRedisClient(): Promise<RedisClientType | null> {
    const redisUrl = getRedisUrl();
    if (!redisUrl) return null;
    if (redisReady && redisClient) return redisClient;
    if (redisConnecting && redisClient) return redisClient;

    redisConnecting = true;
    redisClient = createClient({ url: redisUrl }) as RedisClientType;
    redisClient.on('error', () => { redisReady = false; });

    try {
        await redisClient.connect();
        redisReady = true;
        console.log('[Redis] Connected successfully');
        return redisClient;
    } catch {
        redisReady = false;
        console.warn('[Redis] Connection failed — using in-memory storage');
        return null;
    } finally {
        redisConnecting = false;
    }
}

async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = await ensureRedisClient();
    if (!client) return;
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, payload, { EX: ttlSeconds });
    } else {
        await client.set(key, payload);
    }
}

async function getJson<T>(key: string): Promise<T | null> {
    const client = await ensureRedisClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export async function persistOtpState(token: string, state: unknown, ttlSeconds = 15 * 60): Promise<void> {
    await setJson(`piechat:auth:otp:${token}`, state, ttlSeconds);
}

export async function persistPhoneSecurityState(phone: string, state: unknown, ttlSeconds = 24 * 60 * 60): Promise<void> {
    await setJson(`piechat:auth:phone:${phone}`, state, ttlSeconds);
}

export async function appendLoginEventToRedis(phone: string, event: LoginEvent): Promise<void> {
    const client = await ensureRedisClient();
    if (!client) return;
    const key = `piechat:auth:events:${phone}`;
    await client.lPush(key, JSON.stringify(event));
    await client.lTrim(key, 0, 99);
    await client.expire(key, 7 * 24 * 60 * 60);
}

export async function getLoginEventsFromRedis(phone: string): Promise<LoginEvent[] | null> {
    const client = await ensureRedisClient();
    if (!client) return null;
    const key = `piechat:auth:events:${phone}`;
    const items = await client.lRange(key, 0, 99);
    if (!items.length) return [];
    return items
        .map((item) => {
            try { return JSON.parse(item) as LoginEvent; }
            catch { return null; }
        })
        .filter((item): item is LoginEvent => Boolean(item));
}

export async function getPhoneSecurityStateFromRedis<T>(phone: string): Promise<T | null> {
    return getJson<T>(`piechat:auth:phone:${phone}`);
}
