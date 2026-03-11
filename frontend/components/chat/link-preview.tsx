'use client';

import { useState, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const previewCache = new Map<string, LinkPreviewData | null>();

// Extract URLs from text
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>)"']+/gi;
  return text.match(urlRegex) || [];
}

function LinkPreviewCard({ url, isMe }: { url: string; isMe: boolean }) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) || null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const fetchPreview = async () => {
      try {
        // Use a CORS proxy or server-side endpoint to fetch HTML meta
        // For now, we'll just show the URL domain info
        const urlObj = new URL(url);
        const data: LinkPreviewData = {
          url,
          siteName: urlObj.hostname.replace('www.', ''),
          title: urlObj.hostname.replace('www.', ''),
        };
        previewCache.set(url, data);
        setPreview(data);
      } catch {
        previewCache.set(url, null);
        setPreview(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
    return () => controller.abort();
  }, [url]);

  if (loading || !preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-1.5 flex items-center gap-2.5 rounded-xl p-2 text-xs transition-all hover:opacity-80 border",
        isMe
          ? "bg-sky-200/40 border-sky-300/40 dark:bg-sky-800/20 dark:border-sky-700/30"
          : "bg-zinc-50 border-zinc-200/60 dark:bg-zinc-700/30 dark:border-zinc-600/30"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        isMe
          ? "bg-sky-200 text-sky-700 dark:bg-sky-800/40 dark:text-sky-400"
          : "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
      )}>
        🔗
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-semibold truncate",
          isMe ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-800 dark:text-zinc-100"
        )}>
          {preview.title || preview.siteName}
        </p>
        {preview.description && (
          <p className="text-zinc-500 dark:text-zinc-400 line-clamp-1">{preview.description}</p>
        )}
        <p className="text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{preview.siteName}</p>
      </div>
      <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400" />
    </a>
  );
}

export function LinkPreviews({ text, isMe }: { text: string; isMe: boolean }) {
  const urls = extractUrls(text);
  if (urls.length === 0) return null;

  return (
    <div className="space-y-1">
      {urls.slice(0, 2).map((url, i) => (
        <LinkPreviewCard key={`${url}-${i}`} url={url} isMe={isMe} />
      ))}
    </div>
  );
}
