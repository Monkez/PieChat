// ─── Sticker Pack System ─────────────────────────────────
// Extensible sticker pack architecture for PieChat.
// Each pack is a folder under /public/stickers/{pack-id}/
// containing a manifest.json and image files.
//
// Future: Sticker Store will allow downloading packs from
// a remote repository. Packs will be stored in IndexedDB
// for persistence.

export interface Sticker {
  id: string;
  emoji: string;
  tags: string[];
  file: string;
}

export interface StickerPackManifest {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  thumbnail: string;
  stickers: Sticker[];
}

export interface InstalledStickerPack {
  manifest: StickerPackManifest;
  baseUrl: string; // e.g. "/stickers/piepie-emotions"
  installedAt: number;
  isBuiltIn: boolean;
}

// ─── Default packs that ship with PieChat ────────────────
const BUILT_IN_PACK_IDS = ['piepie-emotions', 'animated-cats'];

class StickerService {
  private installedPacks: Map<string, InstalledStickerPack> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load installed packs from localStorage
    this.loadInstalledPacks();

    // Ensure built-in packs are installed
    for (const packId of BUILT_IN_PACK_IDS) {
      if (!this.installedPacks.has(packId)) {
        await this.installBuiltInPack(packId);
      }
    }

    this.initialized = true;
  }

  private loadInstalledPacks(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('piechat_sticker_packs');
      if (stored) {
        const packs: InstalledStickerPack[] = JSON.parse(stored);
        for (const pack of packs) {
          this.installedPacks.set(pack.manifest.id, pack);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private saveInstalledPacks(): void {
    if (typeof window === 'undefined') return;
    const packs = Array.from(this.installedPacks.values());
    localStorage.setItem('piechat_sticker_packs', JSON.stringify(packs));
  }

  private async installBuiltInPack(packId: string): Promise<void> {
    try {
      const baseUrl = `/stickers/${packId}`;
      const response = await fetch(`${baseUrl}/manifest.json`);
      if (!response.ok) return;
      const manifest: StickerPackManifest = await response.json();
      const pack: InstalledStickerPack = {
        manifest,
        baseUrl,
        installedAt: Date.now(),
        isBuiltIn: true,
      };
      this.installedPacks.set(packId, pack);
      this.saveInstalledPacks();
    } catch (err) {
      console.warn(`[StickerService] Failed to load built-in pack "${packId}":`, err);
    }
  }

  // ─── Public API ────────────────────────────────────────

  /** Install a pack from a URL (for future Sticker Store) */
  async installFromUrl(manifestUrl: string): Promise<InstalledStickerPack | null> {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest: StickerPackManifest = await response.json();

      // Derive base URL from manifest URL
      const baseUrl = manifestUrl.replace(/\/manifest\.json$/, '');

      const pack: InstalledStickerPack = {
        manifest,
        baseUrl,
        installedAt: Date.now(),
        isBuiltIn: false,
      };
      this.installedPacks.set(manifest.id, pack);
      this.saveInstalledPacks();
      return pack;
    } catch (err) {
      console.error('[StickerService] Install failed:', err);
      return null;
    }
  }

  /** Uninstall a pack (cannot uninstall built-in packs) */
  uninstall(packId: string): boolean {
    const pack = this.installedPacks.get(packId);
    if (!pack || pack.isBuiltIn) return false;
    this.installedPacks.delete(packId);
    this.saveInstalledPacks();
    return true;
  }

  /** Get all installed packs */
  getInstalledPacks(): InstalledStickerPack[] {
    return Array.from(this.installedPacks.values());
  }

  /** Get a specific pack */
  getPack(packId: string): InstalledStickerPack | undefined {
    return this.installedPacks.get(packId);
  }

  /** Get the full URL for a sticker image */
  getStickerUrl(packId: string, stickerId: string): string | null {
    const pack = this.installedPacks.get(packId);
    if (!pack) return null;
    const sticker = pack.manifest.stickers.find(s => s.id === stickerId);
    if (!sticker) return null;
    return `${pack.baseUrl}/${sticker.file}`;
  }

  /** Search stickers across all packs */
  searchStickers(query: string): Array<{ pack: InstalledStickerPack; sticker: Sticker }> {
    const results: Array<{ pack: InstalledStickerPack; sticker: Sticker }> = [];
    const q = query.toLowerCase();
    for (const pack of this.installedPacks.values()) {
      for (const sticker of pack.manifest.stickers) {
        if (
          sticker.id.includes(q) ||
          sticker.emoji.includes(q) ||
          sticker.tags.some(tag => tag.includes(q))
        ) {
          results.push({ pack, sticker });
        }
      }
    }
    return results;
  }

  /** Get all stickers from all installed packs, grouped by pack */
  getAllStickers(): Array<{
    pack: InstalledStickerPack;
    stickers: Array<{ sticker: Sticker; url: string }>;
  }> {
    return this.getInstalledPacks().map(pack => ({
      pack,
      stickers: pack.manifest.stickers.map(sticker => ({
        sticker,
        url: `${pack.baseUrl}/${sticker.file}`,
      })),
    }));
  }
}

export const stickerService = new StickerService();
