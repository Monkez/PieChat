'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Users, BookUser, Bot, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/lib/store/ui-store';
import { t } from '@/lib/i18n';
import { useMatrixStore } from '@/lib/store/matrix-store';

interface MobileBottomBarProps {
    activeSection?: string;
    onSectionChange?: (section: 'personal' | 'channels' | 'contacts' | 'assistants') => void;
}

export function MobileBottomBar({ activeSection, onSectionChange }: MobileBottomBarProps) {
    const { language } = useUiStore();
    const pathname = usePathname();
    const { rooms } = useMatrixStore();

    const isSettings = pathname === '/settings';
    const recentChats = rooms.filter((r) => r.type === 'dm' || r.type === 'group');
    const totalUnread = recentChats.reduce((acc, r) => acc + (r.unreadCount || 0), 0);

    const tabs = [
        {
            id: 'personal' as const,
            icon: MessageSquare,
            label: t(language, 'chatTabPersonal'),
            href: '/chat',
            badge: totalUnread > 0 ? totalUnread : undefined,
        },
        {
            id: 'channels' as const,
            icon: Users,
            label: t(language, 'chatTabChannels'),
            href: '/chat',
        },
        {
            id: 'contacts' as const,
            icon: BookUser,
            label: t(language, 'chatTabContacts'),
            href: '/chat',
        },
        {
            id: 'assistants' as const,
            icon: Bot,
            label: t(language, 'chatTabAssistant' as any),
            href: '/chat',
        },
        {
            id: 'settings' as const,
            icon: Settings,
            label: t(language, 'settingsTitle'),
            href: '/settings',
        },
    ];

    return (
        <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around text-white py-1"
            style={{ background: 'var(--accent-600)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.id === 'settings'
                    ? isSettings
                    : !isSettings && activeSection === tab.id;

                if (tab.id === 'settings') {
                    return (
                        <Link
                            key={tab.id}
                            href={tab.href}
                            className={cn(
                                "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all text-center min-w-0",
                                isActive ? "bg-white/20" : "hover:bg-white/10"
                            )}
                        >
                            <Icon className="h-6 w-6" />
                            <span className="text-[11px] font-medium">{tab.label}</span>
                        </Link>
                    );
                }

                return (
                    <Link
                        key={tab.id}
                        href={tab.href}
                        onClick={(e) => {
                            if (onSectionChange && !isSettings) {
                                e.preventDefault();
                                onSectionChange(tab.id);
                            }
                        }}
                        className={cn(
                            "flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg transition-all relative text-center min-w-0",
                            isActive ? "bg-white/20" : "hover:bg-white/10"
                        )}
                    >
                        <Icon className="h-6 w-6" />
                        <span className="text-[11px] font-medium">{tab.label}</span>
                        {tab.badge && (
                            <span className="absolute top-0.5 right-0.5 h-[18px] min-w-[18px] flex items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                                {tab.badge}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
