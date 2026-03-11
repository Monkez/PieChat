'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { useWebRTC } from '@/hooks/use-webrtc';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User, Volume2, Settings2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { callSound } from '@/lib/call-sound';

// ── Audio Level Meter ────────────────────────────────
function AudioMeter({ stream, label }: { stream: MediaStream | null; label: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animRef = useRef<number>(0);

    useEffect(() => {
        if (!stream || !canvasRef.current) return;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
            animRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            // RMS volume
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
            const rms = Math.sqrt(sum / dataArray.length);
            const level = Math.min(rms / 128, 1); // 0-1

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw bars
            const bars = 12;
            const barW = (canvas.width - (bars - 1) * 2) / bars;
            for (let i = 0; i < bars; i++) {
                const threshold = i / bars;
                const active = level > threshold;
                ctx.fillStyle = active
                    ? (i < 8 ? '#22c55e' : i < 10 ? '#eab308' : '#ef4444')
                    : 'rgba(255,255,255,0.1)';
                ctx.fillRect(i * (barW + 2), 2, barW, canvas.height - 4);
            }
        };
        draw();

        return () => {
            cancelAnimationFrame(animRef.current);
            audioCtx.close();
        };
    }, [stream]);

    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 w-8 shrink-0">{label}</span>
            <canvas ref={canvasRef} width={120} height={14} className="rounded-sm" />
        </div>
    );
}

// ── Device Selector ──────────────────────────────────
function DeviceSelector({ kind, value, onChange }: {
    kind: 'audioinput' | 'audiooutput';
    value: string;
    onChange: (id: string) => void;
}) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(devs => {
            setDevices(devs.filter(d => d.kind === kind));
        });
    }, [kind]);

    const label = kind === 'audioinput' ? 'Mic' : 'Loa';
    const selected = devices.find(d => d.deviceId === value) || devices[0];

    if (devices.length <= 1) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300 transition-all max-w-[180px]"
            >
                {kind === 'audioinput' ? <Mic className="h-3 w-3 shrink-0" /> : <Volume2 className="h-3 w-3 shrink-0" />}
                <span className="truncate">{selected?.label || label}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
            {open && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-10 min-w-[200px]">
                    {devices.map(d => (
                        <button
                            key={d.deviceId}
                            onClick={() => { onChange(d.deviceId); setOpen(false); }}
                            className={cn(
                                "w-full text-left px-3 py-2 text-[11px] transition-colors truncate",
                                d.deviceId === value ? "bg-sky-600/30 text-white" : "text-zinc-300 hover:bg-white/10"
                            )}
                        >
                            {d.label || `${label} ${devices.indexOf(d) + 1}`}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function CallOverlay() {
    const { status, type, remoteUser, stream, remoteStream } = useCallStore();
    const { handleStartCall, handleAcceptCall, handleHangup, toggleMute, toggleCamera } = useWebRTC();
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [duration, setDuration] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [micId, setMicId] = useState('default');
    const [speakerId, setSpeakerId] = useState('default');

    // Start call when dialing
    useEffect(() => {
        if (status === 'dialing') void handleStartCall();
    }, [status]);

    // Timer
    useEffect(() => {
        if (status === 'active') {
            setDuration(0);
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        } else {
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setDuration(0);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [status]);

    // Bind local video
    useEffect(() => {
        if (localVideoRef.current && stream) localVideoRef.current.srcObject = stream;
    }, [stream]);

    // Bind remote video + audio
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
        if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
        }
    }, [remoteStream]);

    // Set speaker output device
    useEffect(() => {
        const el = remoteAudioRef.current as any;
        if (el && el.setSinkId && speakerId) {
            el.setSinkId(speakerId).catch(() => {});
        }
    }, [speakerId, remoteStream]);

    // Reset when call ends
    useEffect(() => {
        if (status === 'none') {
            setIsMuted(false);
            setIsCameraOff(false);
            setShowSettings(false);
        }
    }, [status]);

    // Call Sounds
    useEffect(() => {
        if (status === 'incoming') callSound.play('ringtone');
        else if (status === 'dialing') callSound.play('dialing');
        else if (status === 'active') callSound.stop();
        else if (status === 'none') {
            if (callSound.isPlaying()) { callSound.stop(); callSound.play('hangup'); }
        }
    }, [status]);

    if (status === 'none') return null;

    const formatTime = (s: number) => {
        const mm = Math.floor(s / 60).toString().padStart(2, '0');
        const ss = (s % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const displayName = remoteUser?.displayName || remoteUser?.username || 'User';
    const isVideo = type === 'video';
    const isIncoming = status === 'incoming';
    const isDialing = status === 'dialing';
    const isActive = status === 'active';

    // ── Incoming Call Screen ─────────────────────
    if (isIncoming) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center animate-in fade-in duration-300"
                 style={{ background: isVideo
                    ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)'
                    : 'linear-gradient(135deg, #042f14 0%, #064e3b 50%, #065f46 100%)'
                 }}>

                {/* Animated rings */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={cn(
                        "h-72 w-72 rounded-full border-2 animate-ping opacity-10",
                        isVideo ? "border-violet-400" : "border-emerald-400"
                    )} style={{ animationDuration: '2s' }} />
                    <div className={cn(
                        "absolute h-56 w-56 rounded-full border-2 animate-ping opacity-15",
                        isVideo ? "border-violet-400" : "border-emerald-400"
                    )} style={{ animationDuration: '2.5s' }} />
                </div>

                <div className="relative flex flex-col items-center gap-6 z-10">
                    {/* Type badge */}
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold backdrop-blur-sm",
                        isVideo
                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    )}>
                        {isVideo ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        {isVideo ? 'Cuộc gọi Video' : 'Cuộc gọi thoại'}
                    </div>

                    {/* Avatar */}
                    <div className={cn(
                        "h-28 w-28 rounded-full flex items-center justify-center border-4 shadow-2xl",
                        isVideo
                            ? "bg-violet-500/20 border-violet-400/40 shadow-violet-500/20"
                            : "bg-emerald-500/20 border-emerald-400/40 shadow-emerald-500/20"
                    )}>
                        {remoteUser?.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={remoteUser.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : (
                            <User className={cn("h-14 w-14", isVideo ? "text-violet-300" : "text-emerald-300")} />
                        )}
                    </div>

                    {/* Name & status */}
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-white mb-1">{displayName}</h2>
                        <p className={cn(
                            "text-sm font-medium animate-pulse",
                            isVideo ? "text-violet-300" : "text-emerald-300"
                        )}>
                            Đang gọi đến...
                        </p>
                    </div>

                    {/* Accept / Decline buttons */}
                    <div className="flex items-center gap-12 mt-4">
                        <div className="flex flex-col items-center gap-2">
                            <button
                                onClick={handleHangup}
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:scale-110 active:scale-95"
                            >
                                <PhoneOff className="h-7 w-7" />
                            </button>
                            <span className="text-[11px] text-zinc-400">Từ chối</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <button
                                onClick={() => void handleAcceptCall()}
                                className={cn(
                                    "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-all hover:scale-110 active:scale-95",
                                    isVideo
                                        ? "bg-violet-500 shadow-violet-500/30"
                                        : "bg-emerald-500 shadow-emerald-500/30"
                                )}
                            >
                                {isVideo
                                    ? <Video className="h-8 w-8 animate-bounce" />
                                    : <Phone className="h-8 w-8 animate-bounce" />
                                }
                            </button>
                            <span className="text-[11px] text-zinc-400">
                                {isVideo ? 'Trả lời video' : 'Trả lời'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Active / Dialing Call Screen ──────────────
    const statusText = isDialing ? 'Đang gọi...' : formatTime(duration);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/95 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center p-4 lg:h-[85vh] lg:rounded-3xl lg:border lg:border-white/10 lg:bg-zinc-900/60 lg:shadow-2xl overflow-hidden">

                {/* Hidden audio element for remote audio */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio ref={remoteAudioRef} autoPlay playsInline />

                {/* Main area */}
                <div className="relative flex-1 w-full bg-zinc-800/50 rounded-2xl overflow-hidden flex items-center justify-center">
                    {isVideo && remoteStream ? (
                        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center gap-5 animate-in zoom-in duration-500">
                            <div className={cn(
                                "h-32 w-32 rounded-full flex items-center justify-center border-4 ring-8",
                                isDialing
                                    ? (isVideo ? "bg-violet-500/20 border-violet-500/30 ring-violet-500/10" : "bg-sky-500/20 border-sky-500/30 ring-sky-500/10")
                                    : "bg-emerald-500/20 border-emerald-500/30 ring-emerald-500/10"
                            )}>
                                {remoteUser?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={remoteUser.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                                ) : (
                                    <User className="h-16 w-16 text-white/60" />
                                )}
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white mb-1">{displayName}</h2>
                                <p className={cn(
                                    "font-medium tabular-nums",
                                    isActive ? "text-emerald-400" : "text-sky-400 animate-pulse"
                                )}>
                                    {isVideo ? '📹' : '📞'} {statusText}
                                </p>
                            </div>

                            {/* Audio meters (visible during active call) */}
                            {isActive && (
                                <div className="flex flex-col gap-2 mt-2 bg-black/30 rounded-xl px-4 py-3">
                                    <AudioMeter stream={stream} label="Mic" />
                                    <AudioMeter stream={remoteStream} label="Loa" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Local preview (video) */}
                    {isVideo && stream && (
                        <div className="absolute top-4 right-4 w-28 h-40 bg-zinc-900 rounded-xl overflow-hidden shadow-xl border border-white/10">
                            <video ref={localVideoRef} autoPlay muted playsInline
                                   className={cn("h-full w-full object-cover", isCameraOff && "opacity-0")} />
                            {isCameraOff && (
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                                    <VideoOff className="h-6 w-6 text-zinc-500" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Audio meters for video calls */}
                    {isVideo && isActive && (
                        <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-black/50 rounded-lg px-3 py-2 backdrop-blur-sm">
                            <AudioMeter stream={stream} label="Mic" />
                            <AudioMeter stream={remoteStream} label="Loa" />
                        </div>
                    )}
                </div>

                {/* Device settings panel */}
                {showSettings && (
                    <div className="w-full mt-3 bg-zinc-800/80 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 animate-in slide-in-from-bottom-2 duration-200">
                        <DeviceSelector kind="audioinput" value={micId} onChange={setMicId} />
                        <DeviceSelector kind="audiooutput" value={speakerId} onChange={setSpeakerId} />
                    </div>
                )}

                {/* Controls */}
                <div className="mt-4 flex items-center gap-3">
                    {/* Settings toggle */}
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95",
                            showSettings ? "bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30" : "bg-white/10 text-white hover:bg-white/20"
                        )}
                        title="Cài đặt thiết bị"
                    >
                        <Settings2 className="h-5 w-5" />
                    </button>

                    {/* Mute */}
                    <button
                        onClick={() => setIsMuted(toggleMute())}
                        className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95",
                            isMuted ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30" : "bg-white/10 text-white hover:bg-white/20"
                        )}
                        title={isMuted ? 'Bật mic' : 'Tắt mic'}
                    >
                        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>

                    {/* Camera (video only) */}
                    {isVideo && (
                        <button
                            onClick={() => setIsCameraOff(toggleCamera())}
                            className={cn(
                                "flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95",
                                isCameraOff ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30" : "bg-white/10 text-white hover:bg-white/20"
                            )}
                            title={isCameraOff ? 'Bật camera' : 'Tắt camera'}
                        >
                            {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                        </button>
                    )}

                    {/* Hangup */}
                    <button
                        onClick={handleHangup}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-xl shadow-rose-500/20 transition-all hover:scale-110 active:scale-95 ml-2"
                    >
                        <PhoneOff className="h-6 w-6" />
                    </button>
                </div>

                {/* Decorative */}
                <div className={cn("absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-[100px]", isVideo ? "bg-violet-500/10" : "bg-sky-500/10")} />
                <div className={cn("absolute -top-24 -right-24 h-64 w-64 rounded-full blur-[100px]", isVideo ? "bg-indigo-500/10" : "bg-emerald-500/10")} />
            </div>
        </div>
    );
}
