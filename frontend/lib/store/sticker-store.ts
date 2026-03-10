import { create } from 'zustand';
import { stickerService, InstalledStickerPack, Sticker } from '../services/sticker-service';

interface StickerState {
  initialized: boolean;
  packs: InstalledStickerPack[];
  activePack: string | null; // active pack ID in picker

  initialize: () => Promise<void>;
  refreshPacks: () => void;
  setActivePack: (packId: string) => void;
  installPack: (manifestUrl: string) => Promise<boolean>;
  uninstallPack: (packId: string) => boolean;
  searchStickers: (query: string) => Array<{ pack: InstalledStickerPack; sticker: Sticker }>;
}

export const useStickerStore = create<StickerState>((set, get) => ({
  initialized: false,
  packs: [],
  activePack: null,

  initialize: async () => {
    if (get().initialized) return;
    await stickerService.initialize();
    const packs = stickerService.getInstalledPacks();
    set({
      initialized: true,
      packs,
      activePack: packs[0]?.manifest.id || null,
    });
  },

  refreshPacks: () => {
    set({ packs: stickerService.getInstalledPacks() });
  },

  setActivePack: (packId) => {
    set({ activePack: packId });
  },

  installPack: async (manifestUrl) => {
    const pack = await stickerService.installFromUrl(manifestUrl);
    if (pack) {
      get().refreshPacks();
      return true;
    }
    return false;
  },

  uninstallPack: (packId) => {
    const ok = stickerService.uninstall(packId);
    if (ok) get().refreshPacks();
    return ok;
  },

  searchStickers: (query) => {
    return stickerService.searchStickers(query);
  },
}));
