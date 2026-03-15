'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { buildWidgetSrcdoc, type WidgetPayload } from '@/lib/widget-sdk';
import { Maximize2, AlertTriangle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface WidgetMessageProps {
  widget: WidgetPayload;
  isMe: boolean;
  messageId: string;
  onAction?: (messageId: string, action: string, data: unknown) => void;
}

const TYPE_ICONS: Record<string, string> = {
  chart: '📊',
  table: '📋',
  form: '📝',
  code: '💻',
  progress: '📈',
  custom: '🧩',
};

const TYPE_LABELS: Record<string, string> = {
  chart: 'Chart',
  table: 'Table',
  form: 'Form',
  code: 'Code',
  progress: 'Progress',
  custom: 'Widget',
};

/** Normalize width value: number → '123px', string passthrough, undefined → '100%' */
function normalizeSize(val: string | number | undefined, fallback: string): string {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'number') return `${val}px`;
  return val; // e.g. '80%', '500px'
}

export default function WidgetMessage({ widget, isMe, messageId, onAction }: WidgetMessageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(widget.height || 200);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Listen for postMessage from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const isFromInline = iframeRef.current && event.source === iframeRef.current.contentWindow;
      const isFromFullscreen = fullscreenIframeRef.current && event.source === fullscreenIframeRef.current.contentWindow;
      if (isFromInline || isFromFullscreen) {
        const msg = event.data;
        if (msg?.type === 'piechat-widget-resize' && typeof msg.height === 'number') {
          setIframeHeight(Math.min(800, Math.max(40, msg.height)));
        }
        if (msg?.type === 'piechat-widget-action' && onAction) {
          onAction(messageId, msg.action, msg.data);
        }
      }
    },
    [messageId, onAction]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Close fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  // Build the srcdoc
  const { srcdoc, buildError } = React.useMemo(() => {
    try {
      return { srcdoc: buildWidgetSrcdoc(widget), buildError: null };
    } catch {
      return { srcdoc: '', buildError: 'Failed to build widget content' };
    }
  }, [widget]);

  // Payload size check
  const payloadSize = srcdoc.length;
  const isOversized = payloadSize > 128 * 1024;

  if (isOversized) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl p-3 text-xs",
        isMe
          ? "bg-amber-100/60 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          : "bg-amber-50 text-amber-600 dark:bg-amber-900/10 dark:text-amber-400"
      )}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>Widget too large to display ({Math.round(payloadSize / 1024)}KB)</span>
      </div>
    );
  }

  const displayError = buildError || error;
  if (displayError) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl p-3 text-xs",
        isMe
          ? "bg-rose-100/60 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
          : "bg-rose-50 text-rose-600 dark:bg-rose-900/10 dark:text-rose-400"
      )}>
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>{displayError}</span>
      </div>
    );
  }

  // --- Inline size from widget payload ---
  const inlineWidth = normalizeSize(widget.width, '100%');
  const inlineHeight = iframeHeight;

  // --- Fullscreen Modal Portal ---
  const fullscreenModal = fullscreen ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setFullscreen(false); }}
    >
      {/* Modal container */}
      <div
        className="relative flex flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 overflow-hidden"
        style={{
          width: 'min(95vw, 1200px)',
          height: 'min(90vh, 900px)',
        }}
      >
        {/* Fullscreen header */}
        <div className={cn(
          "flex items-center justify-between px-4 py-2.5 border-b shrink-0",
          "bg-gradient-to-r from-sky-50 to-indigo-50 border-sky-100",
          "dark:from-sky-950/50 dark:to-indigo-950/50 dark:border-sky-900/40"
        )}>
          <div className="flex items-center gap-2">
            <span className="text-base">{TYPE_ICONS[widget.type] || '🧩'}</span>
            <span className="text-sm font-bold text-sky-700 dark:text-sky-300">
              {widget.title || TYPE_LABELS[widget.type] || 'Widget'}
            </span>
            {widget.interactive && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Interactive
              </span>
            )}
          </div>
          <button
            onClick={() => setFullscreen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-all hover:bg-rose-100 hover:text-rose-500 active:scale-90 dark:hover:bg-rose-900/30"
            title="Close fullscreen (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fullscreen iframe - fills the rest */}
        <div className="relative flex-1 overflow-hidden">
          <iframe
            ref={fullscreenIframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts"
            title={widget.title || 'Widget (fullscreen)'}
            className="h-full w-full border-0"
            style={{ colorScheme: 'auto' }}
          />
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Outer wrapper: max-width controls how narrow widget can be */}
      <div
        className="widget-message space-y-1"
        style={{
          width: '100%',
          maxWidth: inlineWidth === '100%' ? undefined : inlineWidth,
        }}
      >
        {/* Header Bar */}
        <div className={cn(
          "flex items-center justify-between rounded-t-xl px-3 py-1.5",
          isMe
            ? "bg-sky-100/80 dark:bg-sky-900/30"
            : "bg-zinc-100/80 dark:bg-zinc-700/40"
        )}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm shrink-0">{TYPE_ICONS[widget.type] || '🧩'}</span>
            <span className={cn(
              "text-[11px] font-bold uppercase tracking-wide truncate",
              isMe ? "text-sky-600 dark:text-sky-400" : "text-zinc-500 dark:text-zinc-400"
            )}>
              {widget.title || TYPE_LABELS[widget.type] || 'Widget'}
            </span>
          </div>

          {/* Only fullscreen button */}
          <button
            onClick={() => setFullscreen(true)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-all hover:scale-110 active:scale-95",
              isMe
                ? "text-sky-500/60 hover:text-sky-600 dark:text-sky-400/60"
                : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500"
            )}
            title="Full screen"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>

        {/* Iframe Container — transparent so it blends with the bubble */}
        <div
          className="relative overflow-hidden rounded-b-xl transition-all duration-300"
          style={{ height: inlineHeight }}
        >
          {/* Loading shimmer */}
          {!loaded && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-300 border-t-transparent" />
                <span className="text-[10px] text-zinc-400">Loading widget...</span>
              </div>
            </div>
          )}

          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts"
            title={widget.title || 'Widget'}
            onLoad={() => setLoaded(true)}
            className={cn(
              "h-full w-full border-0 transition-opacity duration-300",
              loaded ? "opacity-100" : "opacity-0"
            )}
            style={{ colorScheme: 'auto', background: 'transparent' }}
          />
        </div>

        {/* Interactive badge */}
        {widget.interactive && (
          <div className={cn(
            "flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider",
            isMe ? "text-sky-400/50" : "text-zinc-400/50"
          )}>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Interactive
          </div>
        )}
      </div>

      {/* Fullscreen modal via portal */}
      {fullscreenModal}
    </>
  );
}
