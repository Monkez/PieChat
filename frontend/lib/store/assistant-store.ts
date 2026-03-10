import { create } from 'zustand';

export interface AssistantConfig {
    id: string;
    name: string;
    avatar?: string;           // emoji or icon name
    role: string;              // short description
    personality: string;       // personality traits
    rules: string;             // operating rules
    capabilities: string;      // what it can do
    permissions: string[];     // e.g. ['read_messages', 'send_messages', 'manage_files']
    color: string;             // tailwind color class
    bgColor: string;           // tailwind bg class
    isDefault?: boolean;       // cannot be deleted
    createdAt: number;
}

interface AssistantState {
    assistants: AssistantConfig[];
    assistantRoomIds: string[];
    editingAssistant: AssistantConfig | null;
    isModalOpen: boolean;

    loadAssistants: () => void;
    saveAssistant: (config: AssistantConfig) => void;
    deleteAssistant: (id: string) => void;
    addAssistantRoom: (roomId: string) => void;
    syncAssistantRooms: (serverAssistantRoomIds: string[]) => void;
    isAssistantRoom: (roomId: string) => boolean;
    openModal: (assistant?: AssistantConfig) => void;
    closeModal: () => void;
}

const DEFAULT_ASSISTANT: AssistantConfig = {
    id: 'piepie-general',
    name: 'PiePie',
    avatar: '🥧',
    role: 'Trợ lý tổng hợp thông minh',
    personality: 'Thân thiện, chuyên nghiệp, luôn sẵn sàng giúp đỡ. Trả lời ngắn gọn, rõ ràng.',
    rules: 'Luôn trả lời bằng tiếng Việt trừ khi được yêu cầu khác. Không tiết lộ thông tin cá nhân của người dùng.',
    capabilities: 'Trả lời câu hỏi, tìm kiếm thông tin, soạn văn bản, dịch thuật, phân tích dữ liệu, hỗ trợ lập trình.',
    permissions: ['read_messages', 'send_messages', 'search_web', 'generate_text'],
    color: 'text-sky-500',
    bgColor: 'bg-sky-50',
    isDefault: true,
    createdAt: Date.now(),
};

const STORAGE_KEY = 'piechat_assistants';
const ROOMS_STORAGE_KEY = 'piechat_assistant_rooms';

function loadFromStorage(): AssistantConfig[] {
    if (typeof window === 'undefined') return [DEFAULT_ASSISTANT];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [DEFAULT_ASSISTANT];
        const parsed = JSON.parse(raw) as AssistantConfig[];
        // Ensure default assistant always exists
        if (!parsed.find((a) => a.id === DEFAULT_ASSISTANT.id)) {
            parsed.unshift(DEFAULT_ASSISTANT);
        }
        return parsed;
    } catch {
        return [DEFAULT_ASSISTANT];
    }
}

function saveToStorage(assistants: AssistantConfig[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assistants));
}

function loadRoomIdsFromStorage(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(ROOMS_STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as string[];
    } catch {
        return [];
    }
}

function saveRoomIdsToStorage(ids: string[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(ids));
}

const COLORS = [
    { color: 'text-sky-500', bg: 'bg-sky-50' },
    { color: 'text-amber-500', bg: 'bg-amber-50' },
    { color: 'text-purple-500', bg: 'bg-purple-50' },
    { color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { color: 'text-rose-500', bg: 'bg-rose-50' },
    { color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { color: 'text-teal-500', bg: 'bg-teal-50' },
    { color: 'text-orange-500', bg: 'bg-orange-50' },
];

export const AVAILABLE_COLORS = COLORS;

export const AVAILABLE_PERMISSIONS = [
    { key: 'read_messages', label: 'Đọc tin nhắn' },
    { key: 'send_messages', label: 'Gửi tin nhắn' },
    { key: 'search_web', label: 'Tìm kiếm web' },
    { key: 'generate_text', label: 'Soạn văn bản' },
    { key: 'generate_image', label: 'Tạo hình ảnh' },
    { key: 'manage_files', label: 'Quản lý file' },
    { key: 'code_execution', label: 'Chạy code' },
    { key: 'translate', label: 'Dịch thuật' },
];

export const useAssistantStore = create<AssistantState>((set, get) => ({
    assistants: [DEFAULT_ASSISTANT],
    assistantRoomIds: [],
    editingAssistant: null,
    isModalOpen: false,

    loadAssistants: () => {
        set({ assistants: loadFromStorage(), assistantRoomIds: loadRoomIdsFromStorage() });
    },

    saveAssistant: (config) => {
        const { assistants } = get();
        const idx = assistants.findIndex((a) => a.id === config.id);
        let updated: AssistantConfig[];
        if (idx >= 0) {
            updated = [...assistants];
            updated[idx] = config;
        } else {
            updated = [...assistants, config];
        }
        saveToStorage(updated);
        set({ assistants: updated, isModalOpen: false, editingAssistant: null });
    },

    deleteAssistant: (id) => {
        const { assistants } = get();
        const target = assistants.find((a) => a.id === id);
        if (target?.isDefault) return; // cannot delete default
        const updated = assistants.filter((a) => a.id !== id);
        saveToStorage(updated);
        set({ assistants: updated });
    },

    openModal: (assistant) => {
        set({ isModalOpen: true, editingAssistant: assistant || null });
    },

    addAssistantRoom: (roomId) => {
        const { assistantRoomIds } = get();
        if (assistantRoomIds.includes(roomId)) return;
        const updated = [...assistantRoomIds, roomId];
        saveRoomIdsToStorage(updated);
        set({ assistantRoomIds: updated });
    },

    syncAssistantRooms: (serverAssistantRoomIds) => {
        const { assistantRoomIds } = get();
        // Merge: combine localStorage IDs with server-detected IDs
        const merged = Array.from(new Set([...assistantRoomIds, ...serverAssistantRoomIds]));
        if (merged.length !== assistantRoomIds.length || !merged.every(id => assistantRoomIds.includes(id))) {
            saveRoomIdsToStorage(merged);
            set({ assistantRoomIds: merged });
        }
    },

    isAssistantRoom: (roomId) => {
        return get().assistantRoomIds.includes(roomId);
    },

    closeModal: () => {
        set({ isModalOpen: false, editingAssistant: null });
    },
}));
