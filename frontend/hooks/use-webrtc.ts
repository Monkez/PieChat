'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { matrixService } from '@/lib/services/matrix-service';
import { callSound } from '@/lib/call-sound';

const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export function useWebRTC() {
    const {
        status, type, roomId, callId, offer,
        setStream, setRemoteStream, endCall, acceptCall,
    } = useCallStore();

    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const localStream = useRef<MediaStream | null>(null);
    const processedEventIds = useRef<Set<string>>(new Set());
    const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

    // ─── Cleanup ────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
            localStream.current = null;
        }
        pendingCandidates.current = [];
        processedEventIds.current.clear();
        setStream(null);
        setRemoteStream(null);
    }, [setStream, setRemoteStream]);

    useEffect(() => {
        if (status === 'none') {
            cleanup();
        }
    }, [status, cleanup]);

    // ─── Get local media (always get audio + video based on CURRENT store type) ──
    const initLocalStream = useCallback(async () => {
        // Read type from store directly to avoid stale closure
        const callType = useCallStore.getState().type;
        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: callType === 'video' ? {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 },
                } : false,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStream.current = stream;
            setStream(stream);
            console.log('[Call] Got local stream: audio tracks =', stream.getAudioTracks().length, ', video tracks =', stream.getVideoTracks().length);
            return stream;
        } catch (err) {
            console.error('[Call] Failed to get user media:', err);
            alert('Không thể truy cập camera/microphone. Vui lòng cấp quyền.');
            return null;
        }
    }, [setStream]);

    // ─── Create peer connection ─────────────────────────
    const createPeerConnection = useCallback((stream: MediaStream) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        // Add ALL tracks (audio + video)
        stream.getTracks().forEach(track => {
            console.log('[Call] Adding track:', track.kind, track.label, 'enabled:', track.enabled);
            pc.addTrack(track, stream);
        });

        pc.ontrack = (event) => {
            console.log('[Call] Remote track received:', event.track.kind, 'streams:', event.streams.length);
            if (event.streams && event.streams[0]) {
                useCallStore.getState().setRemoteStream(event.streams[0]);
            } else {
                // Fallback: create stream from track
                const remoteStream = new MediaStream([event.track]);
                useCallStore.getState().setRemoteStream(remoteStream);
            }
        };

        pc.onicecandidate = (event) => {
            const cRoomId = useCallStore.getState().roomId;
            const cCallId = useCallStore.getState().callId;
            if (event.candidate && cRoomId && cCallId) {
                // Send candidate immediately
                matrixService.sendCallEvent(cRoomId, cCallId, 'm.call.candidates', {
                    candidates: [{
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    }]
                }).catch(() => {});
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('[Call] ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                console.log('[Call] ICE connected!');
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[Call] Connection state:', pc.connectionState);
            if (pc.connectionState === 'failed') {
                console.warn('[Call] Connection failed');
            }
        };

        peerConnection.current = pc;
        return pc;
    }, []);

    // ─── Start outgoing call ────────────────────────────
    const handleStartCall = useCallback(async () => {
        const stream = await initLocalStream();
        const cRoomId = useCallStore.getState().roomId;
        const cCallId = useCallStore.getState().callId;
        if (!stream || !cRoomId || !cCallId) return;

        const pc = createPeerConnection(stream);

        const offerSdp = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: useCallStore.getState().type === 'video',
        });
        await pc.setLocalDescription(offerSdp);

        console.log('[Call] Sending invite for', cCallId);
        await matrixService.sendCallEvent(cRoomId, cCallId, 'm.call.invite', {
            offer: { sdp: offerSdp.sdp, type: 'offer' },
            lifetime: 30000,
        });
    }, [initLocalStream, createPeerConnection]);

    // ─── Accept incoming call ───────────────────────────
    const handleAcceptCall = useCallback(async () => {
        // Immediately transition to active state for faster UI feedback
        acceptCall();
        callSound.stop();

        const stream = await initLocalStream();
        const cRoomId = useCallStore.getState().roomId;
        const cCallId = useCallStore.getState().callId;
        const currentOffer = useCallStore.getState().offer;
        if (!stream || !cRoomId || !cCallId || !currentOffer) return;

        const pc = createPeerConnection(stream);
        const sdp = currentOffer.offer || currentOffer;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Apply any pending ICE candidates that arrived before remote description
        for (const c of pendingCandidates.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];

        const answerSdp = await pc.createAnswer();
        await pc.setLocalDescription(answerSdp);

        console.log('[Call] Sending answer for', cCallId);
        await matrixService.sendCallEvent(cRoomId, cCallId, 'm.call.answer', {
            answer: { sdp: answerSdp.sdp, type: 'answer' },
        });
    }, [initLocalStream, createPeerConnection, acceptCall]);

    // ─── Hang up / Decline ──────────────────────────────
    const handleHangup = useCallback(() => {
        const cRoomId = useCallStore.getState().roomId;
        const cCallId = useCallStore.getState().callId;
        const cStatus = useCallStore.getState().status;
        // Stop sounds and cleanup immediately
        callSound.stop();
        cleanup();
        useCallStore.getState().endCall();
        // Send hangup in background
        if (cRoomId && cCallId) {
            matrixService.sendCallEvent(cRoomId, cCallId, 'm.call.hangup', {
                reason: cStatus === 'incoming' ? 'user_busy' : 'user_hangup',
            }).catch(() => {});
        }
    }, [cleanup]);

    // ─── Toggle mute ────────────────────────────────────
    const toggleMute = useCallback(() => {
        if (localStream.current) {
            const audioTrack = localStream.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return !audioTrack.enabled; // true = muted
            }
        }
        return false;
    }, []);

    // ─── Toggle camera ──────────────────────────────────
    const toggleCamera = useCallback(() => {
        if (localStream.current) {
            const videoTrack = localStream.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                return !videoTrack.enabled; // true = camera off
            }
        }
        return false;
    }, []);

    // ─── Poll for remote call events (fast polling) ─────
    useEffect(() => {
        if (status === 'none') return;
        const cCallId = useCallStore.getState().callId;
        if (!cCallId) return;

        const processEvents = () => {
            const callEvents = matrixService.getLastCallEvents();
            const myUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('matrix_user_id') : null;
            const cStatus = useCallStore.getState().status;

            for (const event of callEvents) {
                if (event.sender === myUserId) continue;
                if (processedEventIds.current.has(event.event_id)) continue;

                const eventCallId = event.content.call_id as string;
                if (eventCallId !== cCallId) continue;

                processedEventIds.current.add(event.event_id);

                // Handle remote answer (we are the caller)
                if (event.type === 'm.call.answer') {
                    const pc = peerConnection.current;
                    if (pc && pc.signalingState === 'have-local-offer') {
                        const answerSdp = event.content.answer;
                        pc.setRemoteDescription(new RTCSessionDescription(answerSdp as RTCSessionDescriptionInit))
                            .then(() => {
                                console.log('[Call] Remote answer set successfully');
                                // Apply any buffered candidates
                                for (const c of pendingCandidates.current) {
                                    pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                                }
                                pendingCandidates.current = [];
                                useCallStore.getState().acceptCall();
                                callSound.stop();
                            })
                            .catch(err => console.error('[Call] Failed to set remote answer:', err));
                    }
                }

                // Handle remote ICE candidates
                if (event.type === 'm.call.candidates') {
                    const pc = peerConnection.current;
                    const candidates = (event.content.candidates || []) as RTCIceCandidateInit[];
                    if (pc && pc.remoteDescription) {
                        for (const c of candidates) {
                            pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                        }
                    } else {
                        pendingCandidates.current.push(...candidates);
                    }
                }

                // Handle remote hangup
                if (event.type === 'm.call.hangup') {
                    console.log('[Call] Remote hangup');
                    callSound.stop();
                    cleanup();
                    useCallStore.getState().endCall();
                }
            }
        };

        // Poll immediately, then at 500ms interval
        processEvents();
        const pollInterval = setInterval(processEvents, 500);

        return () => clearInterval(pollInterval);
    }, [status, cleanup]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    return { handleStartCall, handleAcceptCall, handleHangup, toggleMute, toggleCamera };
}
