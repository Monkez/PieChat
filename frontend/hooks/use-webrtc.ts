'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { matrixService } from '@/lib/services/matrix-service';

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
        setStream(null);
        setRemoteStream(null);
    }, [setStream, setRemoteStream]);

    useEffect(() => {
        if (status === 'none') {
            cleanup();
        }
    }, [status, cleanup]);

    // ─── Get local media ────────────────────────────────
    const initLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video',
            });
            localStream.current = stream;
            setStream(stream);
            return stream;
        } catch (err) {
            console.error('[Call] Failed to get user media:', err);
            alert('Không thể truy cập camera/microphone. Vui lòng cấp quyền.');
            return null;
        }
    }, [type, setStream]);

    // ─── Create peer connection ─────────────────────────
    const createPeerConnection = useCallback((stream: MediaStream) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        pc.ontrack = (event) => {
            console.log('[Call] Remote track received:', event.streams.length, 'streams');
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            }
        };

        pc.onicecandidate = (event) => {
            const currentRoomId = useCallStore.getState().roomId;
            const currentCallId = useCallStore.getState().callId;
            if (event.candidate && currentRoomId && currentCallId) {
                void matrixService.sendCallEvent(currentRoomId, currentCallId, 'm.call.candidates', {
                    candidates: [{
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    }]
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[Call] Connection state:', pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.warn('[Call] Connection lost');
            }
        };

        peerConnection.current = pc;
        return pc;
    }, [setRemoteStream]);

    // ─── Start outgoing call ────────────────────────────
    const handleStartCall = useCallback(async () => {
        const stream = await initLocalStream();
        const currentRoomId = useCallStore.getState().roomId;
        const currentCallId = useCallStore.getState().callId;
        if (!stream || !currentRoomId || !currentCallId) return;

        const pc = createPeerConnection(stream);
        const offerSdp = await pc.createOffer();
        await pc.setLocalDescription(offerSdp);

        console.log('[Call] Sending invite for', currentCallId);
        void matrixService.sendCallEvent(currentRoomId, currentCallId, 'm.call.invite', {
            offer: { sdp: offerSdp.sdp, type: 'offer' },
            lifetime: 30000,
        });
    }, [initLocalStream, createPeerConnection]);

    // ─── Accept incoming call ───────────────────────────
    const handleAcceptCall = useCallback(async () => {
        const stream = await initLocalStream();
        const currentRoomId = useCallStore.getState().roomId;
        const currentCallId = useCallStore.getState().callId;
        const currentOffer = useCallStore.getState().offer;
        if (!stream || !currentRoomId || !currentCallId || !currentOffer) return;

        const pc = createPeerConnection(stream);
        const sdp = currentOffer.offer || currentOffer;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Apply any pending ICE candidates that arrived before we set remote description
        for (const c of pendingCandidates.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];

        const answerSdp = await pc.createAnswer();
        await pc.setLocalDescription(answerSdp);

        console.log('[Call] Sending answer for', currentCallId);
        void matrixService.sendCallEvent(currentRoomId, currentCallId, 'm.call.answer', {
            answer: { sdp: answerSdp.sdp, type: 'answer' },
        });
        acceptCall();
    }, [initLocalStream, createPeerConnection, acceptCall]);

    // ─── Hang up / Decline ──────────────────────────────
    const handleHangup = useCallback(() => {
        const currentRoomId = useCallStore.getState().roomId;
        const currentCallId = useCallStore.getState().callId;
        const currentStatus = useCallStore.getState().status;
        // Always cleanup and end call first, then try to send hangup event
        cleanup();
        useCallStore.getState().endCall();
        // Send hangup event in background (don't block UI)
        if (currentRoomId && currentCallId) {
            matrixService.sendCallEvent(currentRoomId, currentCallId, 'm.call.hangup', {
                reason: currentStatus === 'incoming' ? 'user_busy' : 'user_hangup',
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

    // ─── Poll for remote call events ────────────────────
    useEffect(() => {
        if (status === 'none') return;
        const currentCallId = useCallStore.getState().callId;
        if (!currentCallId) return;

        const pollInterval = setInterval(() => {
            const callEvents = matrixService.getLastCallEvents();
            const myUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('matrix_user_id') : null;
            const currentStatus = useCallStore.getState().status;

            for (const event of callEvents) {
                // Skip own events
                if (event.sender === myUserId) continue;
                // Skip already processed
                if (processedEventIds.current.has(event.event_id)) continue;

                const eventCallId = event.content.call_id as string;
                if (eventCallId !== currentCallId) continue;

                processedEventIds.current.add(event.event_id);

                // Handle remote answer (we are the caller)
                if (event.type === 'm.call.answer' && (currentStatus === 'dialing' || currentStatus === 'active')) {
                    const pc = peerConnection.current;
                    if (pc && pc.signalingState === 'have-local-offer') {
                        const answerSdp = event.content.answer;
                        void pc.setRemoteDescription(new RTCSessionDescription(answerSdp as RTCSessionDescriptionInit)).then(() => {
                            console.log('[Call] Remote answer set');
                            useCallStore.getState().acceptCall();
                        });
                    }
                }

                // Handle remote ICE candidates
                if (event.type === 'm.call.candidates') {
                    const pc = peerConnection.current;
                    const candidates = (event.content.candidates || []) as RTCIceCandidateInit[];
                    if (pc && pc.remoteDescription) {
                        for (const c of candidates) {
                            void pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                        }
                    } else {
                        // Store for later if remote description not yet set
                        pendingCandidates.current.push(...candidates);
                    }
                }

                // Handle remote hangup
                if (event.type === 'm.call.hangup') {
                    console.log('[Call] Remote hangup');
                    cleanup();
                    endCall();
                }
            }
        }, 1000); // Poll faster for better responsiveness

        return () => clearInterval(pollInterval);
    }, [status, endCall, cleanup]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    return { handleStartCall, handleAcceptCall, handleHangup, toggleMute, toggleCamera };
}
