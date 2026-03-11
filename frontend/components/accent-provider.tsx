'use client';

import { useEffect } from 'react';
import { useThemeStore, generatePalette } from '@/lib/store/theme-store';

/**
 * Sets the data-accent attribute on <html> and injects custom CSS vars.
 */
export function AccentProvider() {
  const accent = useThemeStore(s => s.accent);
  const customColor = useThemeStore(s => s.customColor);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-accent', accent);

    if (accent === 'custom' && customColor) {
      const palette = generatePalette(customColor);
      Object.entries(palette).forEach(([shade, hex]) => {
        root.style.setProperty(`--accent-${shade}`, hex);
      });
    } else {
      // Reset custom vars — let CSS data-accent rules take over
      ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'].forEach(shade => {
        root.style.removeProperty(`--accent-${shade}`);
      });
    }
  }, [accent, customColor]);

  return null;
}
