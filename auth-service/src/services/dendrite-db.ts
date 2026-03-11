/**
 * Dendrite Database Service — Direct SQLite access to Dendrite's databases
 * Provides comprehensive admin data: all users, rooms, presence, etc.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const DENDRITE_DATA = process.env.DENDRITE_DATA_PATH || '/dendrite-data';

function openDB(name: string): Database.Database | null {
    const path = `${DENDRITE_DATA}/${name}`;
    if (!existsSync(path)) {
        console.warn(`[DendriteDB] Database not found: ${path}`);
        return null;
    }
    try {
        return new Database(path, { readonly: true, fileMustExist: true });
    } catch (err) {
        console.error(`[DendriteDB] Cannot open ${path}:`, err);
        return null;
    }
}

// ─── List All User Accounts ─────────────────────────────

export interface DendriteUser {
    localpart: string;
    server_name: string;
    display_name: string;
    avatar_url: string;
    created_ts: number;
    is_deactivated: boolean;
}

export function listAllUsers(): DendriteUser[] {
    const db = openDB('dendrite-userapi-accounts.db');
    if (!db) return [];
    try {
        // Try to discover tables first
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        console.log('[DendriteDB] Account tables:', tables.map(t => t.name).join(', '));

        // Standard Dendrite account table
        const accountTable = tables.find(t => t.name.includes('account'));
        if (!accountTable) { db.close(); return []; }

        const rows = db.prepare(`SELECT * FROM "${accountTable.name}" ORDER BY created_ts DESC`).all() as Record<string, unknown>[];
        db.close();

        return rows.map(row => ({
            localpart: String(row.localpart || ''),
            server_name: String(row.server_name || ''),
            display_name: String(row.display_name || ''),
            avatar_url: String(row.avatar_url || ''),
            created_ts: Number(row.created_ts || 0),
            is_deactivated: Boolean(row.is_deactivated),
        }));
    } catch (err) {
        console.error('[DendriteDB] Error listing users:', err);
        db.close();
        return [];
    }
}

// ─── List All Rooms ─────────────────────────────────────

export interface DendriteRoom {
    room_id: string;
    room_version: string;
    name: string;
    topic: string;
    creator: string;
    is_stub: boolean;
}

export function listAllRooms(): DendriteRoom[] {
    const db = openDB('dendrite-roomserver.db');
    if (!db) return [];
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        console.log('[DendriteDB] Room tables:', tables.map(t => t.name).join(', '));

        // Get room NID to room_id mapping
        const roomTable = tables.find(t => t.name.includes('roomserver_rooms'));
        if (!roomTable) { db.close(); return []; }

        const rooms = db.prepare(`SELECT * FROM "${roomTable.name}"`).all() as Record<string, unknown>[];

        // Try to get room state (name, topic, etc.)
        const result: DendriteRoom[] = [];
        for (const room of rooms) {
            result.push({
                room_id: String(room.room_id || ''),
                room_version: String(room.room_version || ''),
                name: '',
                topic: '',
                creator: '',
                is_stub: Boolean(room.is_stub),
            });
        }

        db.close();
        return result;
    } catch (err) {
        console.error('[DendriteDB] Error listing rooms:', err);
        db.close();
        return [];
    }
}

// ─── Room Membership ────────────────────────────────────

export interface RoomMembership {
    room_id: string;
    user_id: string;
    membership: string;
}

export function getRoomMemberships(): RoomMembership[] {
    const db = openDB('dendrite-roomserver.db');
    if (!db) return [];
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        const memberTable = tables.find(t => t.name.includes('membership'));
        if (!memberTable) { db.close(); return []; }

        // Get rooms lookup
        const roomTable = tables.find(t => t.name.includes('roomserver_rooms'));
        const roomMap = new Map<number, string>();
        if (roomTable) {
            const rooms = db.prepare(`SELECT room_nid, room_id FROM "${roomTable.name}"`).all() as { room_nid: number; room_id: string }[];
            for (const r of rooms) roomMap.set(r.room_nid, r.room_id);
        }

        // Get event state keys (user IDs)
        const stateKeyTable = tables.find(t => t.name.includes('event_state_keys'));
        const userMap = new Map<number, string>();
        if (stateKeyTable) {
            const keys = db.prepare(`SELECT event_state_key_nid, event_state_key FROM "${stateKeyTable.name}"`).all() as { event_state_key_nid: number; event_state_key: string }[];
            for (const k of keys) userMap.set(k.event_state_key_nid, k.event_state_key);
        }

        const memberships = db.prepare(`SELECT * FROM "${memberTable.name}"`).all() as Record<string, unknown>[];
        db.close();

        const MEMBERSHIP_MAP: Record<string, string> = { '1': 'invite', '2': 'join', '3': 'leave', '4': 'ban', '5': 'knock' };
        return memberships.map(m => ({
            room_id: roomMap.get(Number(m.room_nid)) || String(m.room_nid || ''),
            user_id: userMap.get(Number(m.target_nid || m.event_state_key_nid)) || String(m.target_nid || ''),
            membership: MEMBERSHIP_MAP[String(m.membership_nid)] || String(m.membership_nid || ''),
        }));
    } catch (err) {
        console.error('[DendriteDB] Error getting memberships:', err);
        db.close();
        return [];
    }
}

// ─── Online / Presence ──────────────────────────────────

export interface PresenceEntry {
    user_id: string;
    presence: number; // 1=online, 2=offline, 3=unavailable
    last_active_ts: number;
    status_msg: string;
}

export function getPresenceData(): PresenceEntry[] {
    const db = openDB('dendrite-syncapi.db');
    if (!db) return [];
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        const presenceTable = tables.find(t => t.name.includes('presence'));
        if (!presenceTable) { db.close(); return []; }

        const rows = db.prepare(`SELECT * FROM "${presenceTable.name}"`).all() as Record<string, unknown>[];
        db.close();

        return rows.map(row => ({
            user_id: String(row.user_id || ''),
            presence: Number(row.presence || 0),
            last_active_ts: Number(row.last_active_ts || 0),
            status_msg: String(row.status_msg || ''),
        }));
    } catch (err) {
        console.error('[DendriteDB] Error getting presence:', err);
        db.close();
        return [];
    }
}

// ─── Devices ────────────────────────────────────────────

export interface DeviceEntry {
    localpart: string;
    device_id: string;
    display_name: string;
    last_seen_ts: number;
    ip: string;
    user_agent: string;
}

export function getDevices(): DeviceEntry[] {
    const db = openDB('dendrite-userapi-accounts.db');
    if (!db) return [];
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        const deviceTable = tables.find(t => t.name.includes('device'));
        if (!deviceTable) { db.close(); return []; }

        const rows = db.prepare(`SELECT * FROM "${deviceTable.name}"`).all() as Record<string, unknown>[];
        db.close();

        return rows.map(row => ({
            localpart: String(row.localpart || ''),
            device_id: String(row.device_id || ''),
            display_name: String(row.display_name || ''),
            last_seen_ts: Number(row.last_seen_ts || 0),
            ip: String(row.ip || ''),
            user_agent: String(row.user_agent || ''),
        }));
    } catch (err) {
        console.error('[DendriteDB] Error getting devices:', err);
        db.close();
        return [];
    }
}

// ─── Media Files ────────────────────────────────────────

export function getMediaStats(): { totalFiles: number; totalSize: number } {
    const db = openDB('dendrite-mediaapi.db');
    if (!db) return { totalFiles: 0, totalSize: 0 };
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        const mediaTable = tables.find(t => t.name.includes('media'));
        if (!mediaTable) { db.close(); return { totalFiles: 0, totalSize: 0 }; }

        const row = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(file_size_bytes), 0) as total FROM "${mediaTable.name}"`).get() as { cnt: number; total: number };
        db.close();

        return { totalFiles: row.cnt, totalSize: row.total };
    } catch (err) {
        console.error('[DendriteDB] Error getting media stats:', err);
        db.close();
        return { totalFiles: 0, totalSize: 0 };
    }
}
