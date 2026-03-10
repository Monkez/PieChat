'use client';

import { useEffect, useRef } from 'react';
import { useCallStore } from '@/lib/store/call-store';
import { matrixService } from '@/lib/services/matrix-service';

export function useWebRTC() {
    const { status, type, roomId, callId, offer, setStream, setRemoteStream, endCall, acceptCall } = useCallStore();
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const localStream = useRef<MediaStream | null>(null);

    const cleanup = () => {
        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }
        if (localStream.current) {
            localStream.current.getTracks().forEach(track => track.stop());
            localStream.current = null;
        }
        setStream(null);
        setRemoteStream(null);
    };

    useEffect(() => {
        if (status === 'none') {
            cleanup();
        }
    }, [status]);

    const initLocalStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: type === 'video',
            });
            localStream.current = stream;
            setStream(stream);
            return stream;
        } catch (err) {
            console.error('Failed to get user media:', err);
            return null;
        }
    };

    const createPeerConnection = (stream: MediaStream) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
        });

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && roomId && callId) {
                void matrixService.sendCallEvent(roomId, callId, 'm.call.candidates', {
                    candidates: [{
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                    }]
                });
            }
        };

        peerConnection.current = pc;
        return pc;
    };

    const handleStartCall = async () => {
        const stream = await initLocalStream();
        if (!stream || !roomId || !callId) return;

        const pc = createPeerConnection(stream);
        const offerSdp = await pc.createOffer();
        await pc.setLocalDescription(offerSdp);

        void matrixService.sendCallEvent(roomId, callId, 'm.call.invite', {
            offer: { sdp: offerSdp.sdp, type: 'offer' },
            lifetime: 30000,
        });
    };

    const handleAcceptCall = async () => {
        const stream = await initLocalStream();
        if (!stream || !roomId || !callId || !offer) return;

        const pc = createPeerConnection(stream);
        await pc.setRemoteDescription(new RTCSessionDescription(offer.offer || offer));
        const answerSdp = await pc.createAnswer();
        await pc.setLocalDescription(answerSdp);

        void matrixService.sendCallEvent(roomId, callId, 'm.call.answer', {
            answer: { sdp: answerSdp.sdp, type: 'answer' },
        });
        acceptCall();
    };

    const handleHangup = () => {
        if (roomId && callId) {
            void matrixService.sendCallEvent(roomId, callId, 'm.call.hangup', {
                reason: 'user_hangup',
            });
        }
        endCall();
    };

    return { handleStartCall, handleAcceptCall, handleHangup };
}
