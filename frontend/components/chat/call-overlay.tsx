'use client';

import { useEffect, useRef } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Maximize2, Minimize2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useUiStore } from '@/lib/store/ui-store';

export function CallOverlay() {
    const { status, type, remoteUser, stream, remoteStream } = useCallStore();
    const { handleStartCall, handleAcceptCall, handleHangup } = useWebRTC();
    const { language } = useUiStore();
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (status === 'dialing') {
            void handleStartCall();
        }
    }, [status]);

    useEffect(() => {
        if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    if (status === 'none') return null;

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
                            <div className="h-32 w-32 rounded-full bg-sky-500/20 flex items-center justify-center border-4 border-sky-500/30 ring-8 ring-sky-500/10">
                                <User className="h-16 w-16 text-sky-400" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white mb-1">{remoteUser?.username || 'User'}</h2>
                                <p className="text-sky-400 font-medium animate-pulse">
                                    {status === 'dialing' ? t(language, 'callDialing') : status === 'incoming' ? t(language, 'callIncoming') : t(language, 'callActive')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Local Preview */}
                    {type === 'video' && stream && (
                        <div className="absolute top-4 right-4 w-32 h-44 bg-zinc-900 rounded-xl overflow-hidden shadow-xl border border-white/10 transition-all hover:scale-105">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="h-full w-full object-cover"
                            />
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="mt-8 flex items-center gap-6">
                    {status === 'incoming' ? (
                        <>
                            <button
                                onClick={handleHangup}
                                className="group flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-500 transition-all hover:bg-rose-500 hover:text-white"
                            >
                                <PhoneOff className="h-7 w-7" />
                            </button>
                            <button
                                onClick={() => void handleAcceptCall()}
                                className="group flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 transition-all hover:scale-110 active:scale-95"
                            >
                                <Phone className="h-8 w-8 animate-bounce" />
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                                <Mic className="h-5 w-5" />
                            </button>
                            {type === 'video' && (
                                <button className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                                    <Video className="h-5 w-5" />
                                </button>
                            )}
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
