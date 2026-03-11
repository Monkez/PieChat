'use client';

import { useState, useMemo } from 'react';
import { X, Image as ImageIcon, FileText, Film } from 'lucide-react';
import { Message } from '@/lib/services/matrix-service';
import { cn } from '@/lib/utils';

interface MediaGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
}

type TabType = 'images' | 'videos' | 'files';

export function MediaGallery({ isOpen, onClose, messages }: MediaGalleryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('images');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const images = useMemo(() =>
    messages.filter(m => m.msgtype === 'm.image' && m.fileUrl), [messages]);
  const videos = useMemo(() =>
    messages.filter(m => m.msgtype === 'm.video' && m.fileUrl), [messages]);
  const files = useMemo(() =>
    messages.filter(m => (m.msgtype === 'm.file' || m.msgtype === 'io.piechat.folder') && m.fileUrl), [messages]);

  if (!isOpen) return null;

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'images', label: 'Ảnh', icon: <ImageIcon className="h-4 w-4" />, count: images.length },
    { key: 'videos', label: 'Video', icon: <Film className="h-4 w-4" />, count: videos.length },
    { key: 'files', label: 'Tệp', icon: <FileText className="h-4 w-4" />, count: files.length },
  ];

  return (
    <>
      {/* Full-screen image viewer */}
      {selectedImage && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <button onClick={() => setSelectedImage(null)} className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedImage} alt="Preview" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Gallery panel */}
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <div
          className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 mx-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">📂 Kho lưu trữ</h2>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 pt-3">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.key
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                {tab.icon}
                {tab.label}
                <span className="text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[55vh]">
            {/* Images Grid */}
            {activeTab === 'images' && (
              images.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">Chưa có ảnh nào</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {images.map(msg => (
                    <button
                      key={msg.id}
                      onClick={() => setSelectedImage(msg.fileUrl!)}
                      className="relative aspect-square rounded-xl overflow-hidden group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.thumbnailUrl || msg.fileUrl}
                        alt={msg.fileName || 'image'}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <span className="absolute bottom-1 right-1 text-[9px] font-medium text-white bg-black/50 px-1.5 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(msg.timestamp).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}

            {/* Videos List */}
            {activeTab === 'videos' && (
              videos.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">Chưa có video nào</p>
              ) : (
                <div className="space-y-2">
                  {videos.map(msg => (
                    <a
                      key={msg.id}
                      href={msg.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-lg">
                        🎬
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{msg.fileName || 'Video'}</p>
                        <p className="text-xs text-zinc-400">{formatSize(msg.fileSize)} • {new Date(msg.timestamp).toLocaleDateString()}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}

            {/* Files List */}
            {activeTab === 'files' && (
              files.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-8">Chưa có tệp nào</p>
              ) : (
                <div className="space-y-2">
                  {files.map(msg => (
                    <a
                      key={msg.id}
                      href={msg.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={msg.fileName}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-lg">
                        {msg.msgtype === 'io.piechat.folder' ? '📁' : '📎'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{msg.fileName || 'Tệp'}</p>
                        <p className="text-xs text-zinc-400">{formatSize(msg.fileSize)} • {new Date(msg.timestamp).toLocaleDateString()}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
