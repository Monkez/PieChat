'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentColor = 'blue' | 'emerald' | 'orange' | 'rose' | 'violet' | 'amber';

export interface AccentTheme {
  name: string;
  label: string;
  // Tailwind class tokens
  primary: string;       // bg-sky-500 → bg-emerald-500
  primaryHover: string;
  primaryLight: string;  // bg-sky-100
  primaryDark: string;   // dark:bg-sky-900/30
  textPrimary: string;   // text-sky-600
  textPrimaryDark: string; // dark:text-sky-400
  ringPrimary: string;   // ring-sky-400
  bubbleSent: string;    // bg for sent messages
  bubbleSentDark: string;
  gradientFrom: string;
  gradientTo: string;
  // CSS custom properties
  hue: number;
}

export const ACCENT_THEMES: Record<AccentColor, AccentTheme> = {
  blue: {
    name: 'blue',
    label: '🔵 Xanh dương',
    primary: 'bg-sky-500',
    primaryHover: 'hover:bg-sky-600',
    primaryLight: 'bg-sky-100',
    primaryDark: 'dark:bg-sky-900/30',
    textPrimary: 'text-sky-600',
    textPrimaryDark: 'dark:text-sky-400',
    ringPrimary: 'ring-sky-400',
    bubbleSent: 'bg-sky-500',
    bubbleSentDark: 'dark:bg-sky-600',
    gradientFrom: 'from-sky-500',
    gradientTo: 'to-blue-600',
    hue: 199,
  },
  emerald: {
    name: 'emerald',
    label: '🟢 Xanh lá',
    primary: 'bg-emerald-500',
    primaryHover: 'hover:bg-emerald-600',
    primaryLight: 'bg-emerald-100',
    primaryDark: 'dark:bg-emerald-900/30',
    textPrimary: 'text-emerald-600',
    textPrimaryDark: 'dark:text-emerald-400',
    ringPrimary: 'ring-emerald-400',
    bubbleSent: 'bg-emerald-500',
    bubbleSentDark: 'dark:bg-emerald-600',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-green-600',
    hue: 160,
  },
  orange: {
    name: 'orange',
    label: '🟠 Cam',
    primary: 'bg-orange-500',
    primaryHover: 'hover:bg-orange-600',
    primaryLight: 'bg-orange-100',
    primaryDark: 'dark:bg-orange-900/30',
    textPrimary: 'text-orange-600',
    textPrimaryDark: 'dark:text-orange-400',
    ringPrimary: 'ring-orange-400',
    bubbleSent: 'bg-orange-500',
    bubbleSentDark: 'dark:bg-orange-600',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-amber-600',
    hue: 25,
  },
  rose: {
    name: 'rose',
    label: '🌹 Hồng',
    primary: 'bg-rose-500',
    primaryHover: 'hover:bg-rose-600',
    primaryLight: 'bg-rose-100',
    primaryDark: 'dark:bg-rose-900/30',
    textPrimary: 'text-rose-600',
    textPrimaryDark: 'dark:text-rose-400',
    ringPrimary: 'ring-rose-400',
    bubbleSent: 'bg-rose-500',
    bubbleSentDark: 'dark:bg-rose-600',
    gradientFrom: 'from-rose-500',
    gradientTo: 'to-pink-600',
    hue: 350,
  },
  violet: {
    name: 'violet',
    label: '🟣 Tím',
    primary: 'bg-violet-500',
    primaryHover: 'hover:bg-violet-600',
    primaryLight: 'bg-violet-100',
    primaryDark: 'dark:bg-violet-900/30',
    textPrimary: 'text-violet-600',
    textPrimaryDark: 'dark:text-violet-400',
    ringPrimary: 'ring-violet-400',
    bubbleSent: 'bg-violet-500',
    bubbleSentDark: 'dark:bg-violet-600',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-purple-600',
    hue: 263,
  },
  amber: {
    name: 'amber',
    label: '🟡 Vàng',
    primary: 'bg-amber-500',
    primaryHover: 'hover:bg-amber-600',
    primaryLight: 'bg-amber-100',
    primaryDark: 'dark:bg-amber-900/30',
    textPrimary: 'text-amber-600',
    textPrimaryDark: 'dark:text-amber-400',
    ringPrimary: 'ring-amber-400',
    bubbleSent: 'bg-amber-500',
    bubbleSentDark: 'dark:bg-amber-600',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-yellow-600',
    hue: 38,
  },
};

interface ThemeState {
  accent: AccentColor;
  setAccent: (color: AccentColor) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accent: 'blue',
      setAccent: (color) => set({ accent: color }),
    }),
    { name: 'piechat-theme' }
  )
);

/** Get current accent theme config */
export function useAccentTheme(): AccentTheme {
  const accent = useThemeStore(s => s.accent);
  return ACCENT_THEMES[accent];
}
