'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/store/theme-store';

/**
 * Sets the data-accent attribute on <html> to match the current accent theme.
 * Must be rendered once in the root layout.
 */
export function AccentProvider() {
  const accent = useThemeStore(s => s.accent);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  return null;
}
