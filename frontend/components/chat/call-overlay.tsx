'use client';

import { useEffect, useRef, useState } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { callSound } from '@/lib/call-sound';

export function CallOverlay() {
    const { status, type, remoteUser, stream, remoteStream } = useCallStore();
    const { handleStartCall, handleAcceptCall, handleHangup, toggleMute, toggleCamera } = useWebRTC();
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // Mute / camera state
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    // Call timer
    const [duration, setDuration] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Start call when dialing
    useEffect(() => {
        if (status === 'dialing') {
            void handleStartCall();
        }
    }, [status]);

    // Timer for active calls
    useEffect(() => {
        if (status === 'active') {
            setDuration(0);
            timerRef.current = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            setDuration(0);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status]);

    // Bind local video
    useEffect(() => {
        if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Bind remote video
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Reset mute/camera state when call ends
    useEffect(() => {
        if (status === 'none') {
            setIsMuted(false);
            setIsCameraOff(false);
        }
    }, [status]);

    // ─── Call Sounds ─────────────────────────────────
    useEffect(() => {
        if (status === 'incoming') {
            callSound.play('ringtone');
        } else if (status === 'dialing') {
            callSound.play('dialing');
        } else if (status === 'active') {
            callSound.stop();
        } else if (status === 'none') {
            // Play hangup beep if a sound was playing (call just ended)
            if (callSound.isPlaying()) {
                callSound.stop();
                callSound.play('hangup');
            }
        }
        return () => {
            if (status === 'none') {
                // Don't stop hangup on cleanup
            }
        };
    }, [status]);

    if (status === 'none') return null;

    const formatTime = (s: number) => {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const displayName = remoteUser?.displayName || remoteUser?.username || 'User';
    const statusText = status === 'dialing' ? 'Đang gọi...'
        : status === 'incoming' ? 'Cuộc gọi đến'
        : formatTime(duration);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center p-6 lg:h-[80vh] lg:rounded-3xl lg:border lg:border-white/10 lg:bg-zinc-900/40 lg:shadow-2xl overflow-hidden">

                {/* Remote Video / Placeholder */}
                <div className="relative flex-1 w-full bg-zinc-800 rounded-2xl overflow-hidden flex items-center justify-center">
                    {type === 'video' && remoteStream ? (
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="h-full w-full object-cover"
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                            <div className={cn(
                                "h-32 w-32 rounded-full flex items-center justify-center border-4 ring-8",
                                status === 'incoming'
                                    ? "bg-emerald-500/20 border-emerald-500/30 ring-emerald-500/10"
                                    : status === 'dialing'
                                    ? "bg-sky-500/20 border-sky-500/30 ring-sky-500/10"
                                    : "bg-sky-500/20 border-sky-500/30 ring-sky-500/10"
                            )}>
                                <User className="h-16 w-16 text-sky-400" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
                                <p className={cn(
                                    "font-medium",
                                    status === 'active' ? "text-emerald-400 tabular-nums" : "text-sky-400 animate-pulse"
                                )}>
                                    {type === 'video' ? '📹' : '📞'} {statusText}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Local Preview (video calls) */}
                    {type === 'video' && stream && (
                        <div className="absolute top-4 right-4 w-28 h-40 bg-zinc-900 rounded-xl overflow-hidden shadow-xl border border-white/10 transition-all">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className={cn(
                                    "h-full w-full object-cover",
                                    isCameraOff && "opacity-0"
                                )}
                            />
                            {isCameraOff && (
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                                    <VideoOff className="h-6 w-6 text-zinc-500" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="mt-6 flex items-center gap-4">
                    {status === 'incoming' ? (
                        <>
                            {/* Decline */}
                            <button
                                onClick={handleHangup}
                                className="group flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-500 transition-all hover:bg-rose-500 hover:text-white active:scale-95"
                            >
                                <PhoneOff className="h-7 w-7" />
                            </button>
                            {/* Accept */}
                            <button
                                onClick={() => void handleAcceptCall()}
                                className="group flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 transition-all hover:scale-110 active:scale-95"
                            >
                                <Phone className="h-8 w-8 animate-bounce" />
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Mute toggle */}
                            <button
                                onClick={() => {
                                    const muted = toggleMute();
                                    setIsMuted(muted);
                                }}
                                className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95",
                                    isMuted
                                        ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30"
                                        : "bg-white/10 text-white hover:bg-white/20"
                                )}
                                title={isMuted ? 'Bật mic' : 'Tắt mic'}
                            >
                                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                            </button>

                            {/* Camera toggle (video only) */}
                            {type === 'video' && (
                                <button
                                    onClick={() => {
                                        const off = toggleCamera();
                                        setIsCameraOff(off);
                                    }}
                                    className={cn(
                                        "flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-95",
                                        isCameraOff
                                            ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30"
                                            : "bg-white/10 text-white hover:bg-white/20"
                                    )}
                                    title={isCameraOff ? 'Bật camera' : 'Tắt camera'}
                                >
                                    {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                                </button>
                            )}

                            {/* Hang up */}
                            <button
                                onClick={handleHangup}
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl shadow-rose-500/20 transition-all hover:scale-110 active:scale-95"
                            >
                                <PhoneOff className="h-7 w-7" />
                            </button>
                        </>
                    )}
                </div>

                {/* Background Decorative Blur */}
                <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky-500/10 blur-[100px]" />
                <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-[100px]" />
            </div>
        </div>
    );
}
