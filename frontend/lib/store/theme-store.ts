'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentColor = 'blue' | 'emerald' | 'orange' | 'rose' | 'violet' | 'amber' | 'custom';

export const PRESET_COLORS: { id: Exclude<AccentColor, 'custom'>; label: string; color: string }[] = [
  { id: 'blue', label: 'Xanh dương', color: '#0ea5e9' },
  { id: 'emerald', label: 'Xanh lá', color: '#10b981' },
  { id: 'orange', label: 'Cam', color: '#f97316' },
  { id: 'rose', label: 'Hồng', color: '#f43f5e' },
  { id: 'violet', label: 'Tím', color: '#8b5cf6' },
  { id: 'amber', label: 'Vàng', color: '#f59e0b' },
];

interface ThemeState {
  accent: AccentColor;
  customColor: string; // hex color for custom
  setAccent: (color: AccentColor) => void;
  setCustomColor: (hex: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accent: 'blue',
      customColor: '#6366f1', // indigo default
      setAccent: (color) => set({ accent: color }),
      setCustomColor: (hex) => set({ customColor: hex, accent: 'custom' }),
    }),
    { name: 'piechat-theme' }
  )
);

// ─── Color generation utilities ────────────────────
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Generate a full shade palette from a single hex color */
export function generatePalette(hex: string): Record<string, string> {
  const { h, s } = hexToHSL(hex);
  return {
    '50': hslToHex(h, Math.min(s, 100), 97),
    '100': hslToHex(h, Math.min(s, 96), 93),
    '200': hslToHex(h, Math.min(s, 90), 85),
    '300': hslToHex(h, Math.min(s, 85), 72),
    '400': hslToHex(h, Math.min(s, 80), 58),
    '500': hex,
    '600': hslToHex(h, Math.min(s + 5, 100), 42),
    '700': hslToHex(h, Math.min(s + 8, 100), 35),
    '800': hslToHex(h, Math.min(s + 10, 100), 28),
    '900': hslToHex(h, Math.min(s + 12, 100), 22),
  };
}
