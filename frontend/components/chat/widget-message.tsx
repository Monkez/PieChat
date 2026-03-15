'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { buildWidgetSrcdoc, type WidgetPayload } from '@/lib/widget-sdk';
import { Maximize2, Minimize2, AlertTriangle } from 'lucide-react';

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

export default function WidgetMessage({ widget, isMe, messageId, onAction }: WidgetMessageProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(widget.height || 200);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Listen for postMessage from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const msg = event.data;
        if (msg?.type === 'piechat-widget-resize' && typeof msg.height === 'number') {
          setHeight(Math.min(expanded ? 800 : 500, Math.max(40, msg.height)));
        }
        if (msg?.type === 'piechat-widget-action' && onAction) {
          onAction(messageId, msg.action, msg.data);
        }
      }
    },
    [messageId, onAction, expanded]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Build the srcdoc — memoize to avoid re-building on every render
  const { srcdoc, buildError } = React.useMemo(() => {
    try {
      return { srcdoc: buildWidgetSrcdoc(widget), buildError: null };
    } catch {
      return { srcdoc: '', buildError: 'Failed to build widget content' };
    }
  }, [widget]);

  // Payload size check
  const payloadSize = srcdoc.length;
  const isOversized = payloadSize > 128 * 1024; // generous limit for srcdoc

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

  return (
    <div className="widget-message space-y-1">
      {/* Header Bar */}
      <div className={cn(
        "flex items-center justify-between rounded-t-xl px-3 py-1.5",
        isMe
          ? "bg-sky-100/80 dark:bg-sky-900/30"
          : "bg-zinc-100/80 dark:bg-zinc-700/40"
      )}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{TYPE_ICONS[widget.type] || '🧩'}</span>
          <span className={cn(
            "text-[11px] font-bold uppercase tracking-wide",
            isMe ? "text-sky-600 dark:text-sky-400" : "text-zinc-500 dark:text-zinc-400"
          )}>
            {widget.title || TYPE_LABELS[widget.type] || 'Widget'}
          </span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded transition-all hover:scale-110 active:scale-95",
            isMe
              ? "text-sky-500/60 hover:text-sky-600 dark:text-sky-400/60"
              : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500"
          )}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>

      {/* Iframe Container */}
      <div
        className={cn(
          "relative overflow-hidden rounded-b-xl transition-all duration-300",
          isMe
            ? "bg-white dark:bg-zinc-900/50 ring-1 ring-sky-200/50 dark:ring-sky-800/30"
            : "bg-white dark:bg-zinc-800/50 ring-1 ring-zinc-200/50 dark:ring-zinc-700/30"
        )}
        style={{
          height: expanded ? Math.min(800, height) : Math.min(400, height),
          minWidth: expanded ? 360 : 240,
          maxWidth: expanded ? 600 : 380,
        }}
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
          style={{ colorScheme: 'auto' }}
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
  );
}
