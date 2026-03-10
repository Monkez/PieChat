'use client';

import { useState } from 'react';
import { X, Bot, Plus, Settings, Trash2, Sparkles, ChevronRight } from 'lucide-react';
import {
    useAssistantStore,
    AssistantConfig,
    AVAILABLE_COLORS,
    AVAILABLE_PERMISSIONS,
} from '@/lib/store/assistant-store';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';

const EMOJI_OPTIONS = ['🥧', '🤖', '🧠', '⚡', '🎨', '📊', '💻', '🔍', '📝', '🌐', '🎯', '🛡️'];

type View = 'list' | 'edit';

export function AssistantManagerModal() {
    const { isModalOpen, editingAssistant, assistants, saveAssistant, deleteAssistant, closeModal, openModal } = useAssistantStore();
    const { language } = useUiStore();
    const isEn = language === 'en';
    const [view, setView] = useState<View>('list');

    // Edit form state
    const [name, setName] = useState('');
    const [avatar, setAvatar] = useState('🤖');
    const [role, setRole] = useState('');
    const [personality, setPersonality] = useState('');
    const [rules, setRules] = useState('');
    const [capabilities, setCapabilities] = useState('');
    const [permissions, setPermissions] = useState<string[]>([]);
    const [colorIdx, setColorIdx] = useState(0);

    const startEditing = (bot?: AssistantConfig) => {
        if (bot) {
            setName(bot.name);
            setAvatar(bot.avatar || '🤖');
            setRole(bot.role);
            setPersonality(bot.personality);
            setRules(bot.rules);
            setCapabilities(bot.capabilities);
            setPermissions(bot.permissions);
            const ci = AVAILABLE_COLORS.findIndex((c) => c.color === bot.color);
            setColorIdx(ci >= 0 ? ci : 0);
            openModal(bot);
        } else {
            setName('');
            setAvatar('🤖');
            setRole('');
            setPersonality('');
            setRules('');
            setCapabilities('');
            setPermissions(['read_messages', 'send_messages']);
            setColorIdx(0);
            openModal();
        }
        setView('edit');
    };

    const handleSave = () => {
        if (!name.trim()) return;
        const config: AssistantConfig = {
            id: editingAssistant?.id || `assistant-${Date.now()}`,
            name: name.trim(),
            avatar,
            role: role.trim(),
            personality: personality.trim(),
            rules: rules.trim(),
            capabilities: capabilities.trim(),
            permissions,
            color: AVAILABLE_COLORS[colorIdx].color,
            bgColor: AVAILABLE_COLORS[colorIdx].bg,
            isDefault: editingAssistant?.isDefault || false,
            createdAt: editingAssistant?.createdAt || Date.now(),
        };
        saveAssistant(config);
        setView('list');
    };

    const handleClose = () => {
        setView('list');
        closeModal();
    };

    const togglePermission = (key: string) => {
        setPermissions((prev) =>
            prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
        );
    };

    if (!isModalOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">

                {view === 'list' ? (
                    /* ─── LIST VIEW ─── */
                    <>
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-sky-600" />
                                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{t(language, 'assistantManage' as any)}</h3>
                            </div>
                            <button onClick={handleClose} className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <X className="h-4 w-4 text-zinc-500" />
                            </button>
                        </div>

                        <div className="p-4 space-y-2">
                            {assistants.map((bot) => (
                                <div
                                    key={bot.id}
                                    className="group flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 transition-all hover:border-sky-200 hover:bg-white dark:border-zinc-800 dark:bg-zinc-800/30 dark:hover:border-sky-800 dark:hover:bg-zinc-800/60"
                                >
                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bot.bgColor}`}>
                                        <span className="text-lg">{bot.avatar || '🤖'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{bot.name}</span>
                                            {bot.isDefault && (
                                                <span className="text-[9px] font-bold uppercase bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded">{isEn ? 'Default' : 'Mặc định'}</span>
                                            )}
                                        </div>
                                        <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{bot.role}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => startEditing(bot)}
                                            className="rounded-lg p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-sky-600"
                                            title={isEn ? 'Edit' : 'Chỉnh sửa'}
                                        >
                                            <Settings className="h-4 w-4" />
                                        </button>
                                        {!bot.isDefault && (
                                            <button
                                                onClick={() => deleteAssistant(bot.id)}
                                                className="rounded-lg p-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-zinc-400 hover:text-red-500"
                                                title={isEn ? 'Delete' : 'Xóa'}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Add new */}
                            <button
                                onClick={() => startEditing()}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-4 text-sm font-semibold text-zinc-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50/50 dark:hover:border-sky-800 dark:hover:bg-sky-950/20 transition-all"
                            >
                                <Plus className="h-4 w-4" />
                                {isEn ? 'Add new assistant' : 'Thêm trợ lý mới'}
                            </button>
                        </div>
                    </>
                ) : (
                    /* ─── EDIT VIEW ─── */
                    <>
                        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 rounded-t-2xl">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setView('list')} className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                    <ChevronRight className="h-4 w-4 text-zinc-400 rotate-180" />
                                </button>
                                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                                    {editingAssistant ? (isEn ? 'Edit Assistant' : 'Chỉnh sửa Trợ lý') : (isEn ? 'Create New Assistant' : 'Tạo Trợ lý mới')}
                                </h3>
                            </div>
                            <button onClick={handleClose} className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                <X className="h-4 w-4 text-zinc-500" />
                            </button>
                        </div>

                        <div className="p-4 space-y-5">
                            {/* Avatar */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">Avatar</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {EMOJI_OPTIONS.map((emoji) => (
                                        <button key={emoji} onClick={() => setAvatar(emoji)}
                                            className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-all ${avatar === emoji ? 'bg-sky-100 dark:bg-sky-900/30 ring-2 ring-sky-500 scale-110' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200'
                                                }`}
                                        >{emoji}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Assistant Name' : 'Tên trợ lý'} <span className="text-red-500">*</span></label>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: PiePie..."
                                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:text-white" />
                            </div>

                            {/* Role */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Role' : 'Chức năng'}</label>
                                <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="VD: Trợ lý tổng hợp..."
                                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 dark:text-white" />
                            </div>

                            {/* Personality */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Personality' : 'Tính cách'}</label>
                                <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="Mô tả tính cách..." rows={2}
                                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none dark:text-white" />
                            </div>

                            {/* Rules */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Rules' : 'Quy tắc hoạt động'}</label>
                                <textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Quy tắc bot tuân theo..." rows={2}
                                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none dark:text-white" />
                            </div>

                            {/* Capabilities */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Capabilities' : 'Khả năng'}</label>
                                <textarea value={capabilities} onChange={(e) => setCapabilities(e.target.value)} placeholder="Bot có thể làm gì..." rows={2}
                                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none dark:text-white" />
                            </div>

                            {/* Color */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-1 block">{isEn ? 'Color' : 'Màu sắc'}</label>
                                <div className="flex gap-2">
                                    {AVAILABLE_COLORS.map((c, i) => (
                                        <button key={i} onClick={() => setColorIdx(i)}
                                            className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${c.bg} ${colorIdx === i ? 'ring-2 ring-offset-2 ring-sky-500 scale-110' : 'hover:scale-105'
                                                }`}
                                        ><Sparkles className={`h-4 w-4 ${c.color}`} /></button>
                                    ))}
                                </div>
                            </div>

                            {/* Permissions */}
                            <div>
                                <label className="text-xs font-semibold text-zinc-500 uppercase mb-2 block">{isEn ? 'Permissions' : 'Quyền hạn'}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {AVAILABLE_PERMISSIONS.map((perm) => (
                                        <button key={perm.key} onClick={() => togglePermission(perm.key)}
                                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all border ${permissions.includes(perm.key)
                                                    ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
                                                    : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500'
                                                }`}
                                        >
                                            <div className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center ${permissions.includes(perm.key) ? 'bg-sky-500 border-sky-500' : 'border-zinc-300 dark:border-zinc-600'
                                                }`}>
                                                {permissions.includes(perm.key) && (
                                                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            {perm.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="sticky bottom-0 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 rounded-b-2xl">
                            <div>
                                {editingAssistant && !editingAssistant.isDefault && (
                                    <button onClick={() => { deleteAssistant(editingAssistant.id); setView('list'); }}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600">
                                        <Trash2 className="h-3.5 w-3.5" /> {isEn ? 'Delete assistant' : 'Xóa trợ lý'}
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setView('list')} className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">{t(language, 'chatCancel')}</button>
                                <button onClick={handleSave} disabled={!name.trim()}
                                    className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-40 transition-colors shadow-sm"
                                >
                                    {editingAssistant ? (isEn ? 'Save changes' : 'Lưu thay đổi') : (isEn ? 'Create assistant' : 'Tạo trợ lý')}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
