'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Search, Package, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStickerStore } from '@/lib/store/sticker-store';
import { stickerService } from '@/lib/services/sticker-service';

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (packId: string, stickerId: string, stickerUrl: string) => void;
}

export function StickerPicker({ isOpen, onClose, onSelectSticker }: StickerPickerProps) {
  const { initialized, packs, activePack, initialize, setActivePack } = useStickerStore();
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !initialized) {
      initialize();
    }
  }, [isOpen, initialized, initialize]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentPack = activePack ? stickerService.getPack(activePack) : null;
  const allStickersGrouped = stickerService.getAllStickers();

  // Search mode
  const searchResults = search.trim()
    ? stickerService.searchStickers(search.trim())
    : [];
  const isSearching = search.trim().length > 0;

  return (
    <div
      ref={pickerRef}
      className={cn(
        "absolute bottom-full right-0 mb-2 z-50",
        "w-[340px] max-h-[420px] rounded-2xl",
        "bg-white dark:bg-zinc-900",
        "border border-zinc-200 dark:border-zinc-700",
        "shadow-2xl ring-1 ring-black/5",
        "flex flex-col overflow-hidden",
        "animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-2 flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-3 h-9">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm sticker..."
            className="flex-1 bg-transparent text-sm outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-zinc-400 hover:text-zinc-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Pack Tabs */}
      {!isSearching && packs.length > 0 && (
        <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 px-2 py-1.5 overflow-x-auto scrollbar-hide">
          {packs.map(pack => (
            <button
              key={pack.manifest.id}
              onClick={() => setActivePack(pack.manifest.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                activePack === pack.manifest.id
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
              title={pack.manifest.name}
            >
              <img
                src={`${pack.baseUrl}/${pack.manifest.thumbnail}`}
                alt=""
                width={20}
                height={20}
                className="rounded"
              />
              <span className="max-w-[80px] truncate">{pack.manifest.name}</span>
            </button>
          ))}

          {/* Future: Add Pack button for store */}
          <button
            className="flex shrink-0 h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-100 hover:text-sky-500 dark:text-zinc-600 dark:hover:bg-zinc-800 transition-colors"
            title="Thêm bộ sticker"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sticker Grid */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {!initialized ? (
          <div className="flex items-center justify-center py-8 text-zinc-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-500" />
          </div>
        ) : isSearching ? (
          /* Search Results */
          searchResults.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {searchResults.map(({ pack, sticker }) => (
                <button
                  key={`${pack.manifest.id}-${sticker.id}`}
                  onClick={() => {
                    const url = `${pack.baseUrl}/${sticker.file}`;
                    onSelectSticker(pack.manifest.id, sticker.id, url);
                    onClose();
                  }}
                  className="group relative flex aspect-square items-center justify-center rounded-xl p-2 transition-all hover:bg-sky-50 hover:scale-110 active:scale-95 dark:hover:bg-sky-900/20"
                  title={sticker.tags.join(', ')}
                >
                  <img
                    src={`${pack.baseUrl}/${sticker.file}`}
                    alt={sticker.emoji}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
              <Package className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">Không tìm thấy sticker</p>
            </div>
          )
        ) : (
          /* Normal View: Current Pack */
          currentPack ? (
            <div>
              <div className="mb-2 px-1">
                <h3 className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  {currentPack.manifest.name}
                </h3>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                  {currentPack.manifest.author} · {currentPack.manifest.stickers.length} sticker
                </p>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {currentPack.manifest.stickers.map(sticker => (
                  <button
                    key={sticker.id}
                    onClick={() => {
                      const url = `${currentPack.baseUrl}/${sticker.file}`;
                      onSelectSticker(currentPack.manifest.id, sticker.id, url);
                      onClose();
                    }}
                    className="group relative flex aspect-square items-center justify-center rounded-xl p-2 transition-all hover:bg-sky-50 hover:scale-110 active:scale-95 dark:hover:bg-sky-900/20"
                    title={sticker.tags.join(', ')}
                  >
                    <img
                      src={`${currentPack.baseUrl}/${sticker.file}`}
                      alt={sticker.emoji}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
              <Package className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs">Chưa có bộ sticker nào</p>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-zinc-400">{packs.length} bộ sticker</span>
        <button
          className="text-[10px] font-medium text-sky-500 hover:text-sky-600 transition-colors"
          title="Mở cửa hàng sticker (sắp ra mắt)"
        >
          🛍️ Cửa hàng
        </button>
      </div>
    </div>
  );
}
