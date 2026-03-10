import { create } from 'zustand';
import { User, Room } from '../services/matrix-service';

export type CallType = 'voice' | 'video';
export type CallStatus = 'none' | 'dialing' | 'incoming' | 'active' | 'ended';

interface CallState {
    status: CallStatus;
    type: CallType | null;
    roomId: string | null;
    callId: string | null;
    remoteUser: User | null;
    stream: MediaStream | null;
    remoteStream: MediaStream | null;
    offer: any | null; // For incoming calls

    startCall: (roomId: string, remoteUser: User, type: CallType) => void;
    receiveCall: (roomId: string, remoteUser: User, type: CallType, callId: string, offer: any) => void;
    acceptCall: () => void;
    endCall: () => void;
    setStream: (stream: MediaStream | null) => void;
    setRemoteStream: (stream: MediaStream | null) => void;
}

export const useCallStore = create<CallState>((set) => ({
    status: 'none',
    type: null,
    roomId: null,
    callId: null,
    remoteUser: null,
    stream: null,
    remoteStream: null,
    offer: null,

    startCall: (roomId, remoteUser, type) => {
        set({
            status: 'dialing',
            type,
            roomId,
            remoteUser,
            callId: `call-${Date.now()}`,
        });
    },

    receiveCall: (roomId, remoteUser, type, callId, offer) => {
        set({
            status: 'incoming',
            type,
            roomId,
            remoteUser,
            callId,
            offer,
        });
    },

    acceptCall: () => {
        set({ status: 'active' });
    },

    endCall: () => {
        set({
            status: 'none',
            type: null,
            roomId: null,
            callId: null,
            remoteUser: null,
            stream: null,
            remoteStream: null,
            offer: null,
        });
    },

    setStream: (stream) => set({ stream }),
    setRemoteStream: (remoteStream) => set({ remoteStream }),
}));
