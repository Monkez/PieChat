'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authUrl } from '@/lib/config';

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

    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const res = await fetch(authUrl(`/link-preview?url=${encodeURIComponent(url)}`));
        if (!res.ok) throw new Error('Failed');
        const data: LinkPreviewData = await res.json();
        if (!cancelled) {
          previewCache.set(url, data);
          setPreview(data);
        }
      } catch {
        if (!cancelled) {
          // Fallback: show domain info
          try {
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
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreview();
    return () => { cancelled = true; };
  }, [url]);

  if (loading || !preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mt-1.5 flex items-start gap-2.5 rounded-xl p-2.5 text-xs transition-all hover:opacity-80 border overflow-hidden",
        isMe
          ? "bg-sky-200/40 border-sky-300/40 dark:bg-sky-800/20 dark:border-sky-700/30"
          : "bg-zinc-50 border-zinc-200/60 dark:bg-zinc-700/30 dark:border-zinc-600/30"
      )}
    >
      {preview.image && (
        <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <Image
            src={preview.image}
            alt={preview.title || ''}
            fill
            className="object-cover"
            unoptimized
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      {!preview.image && (
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
          isMe
            ? "bg-sky-200 text-sky-700 dark:bg-sky-800/40 dark:text-sky-400"
            : "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400"
        )}>
          🔗
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-semibold truncate text-[13px]",
          "text-zinc-800 dark:text-zinc-100"
        )}>
          {preview.title || preview.siteName}
        </p>
        {preview.description && (
          <p className="text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">{preview.description}</p>
        )}
        <p className="text-zinc-400 dark:text-zinc-500 truncate mt-0.5 text-[10px]">{preview.siteName}</p>
      </div>
      <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400 mt-0.5" />
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
