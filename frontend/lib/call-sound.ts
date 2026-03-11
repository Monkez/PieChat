'use client';

/**
 * Call sound manager — plays ringtone, dialing, busy, hangup sounds.
 * Sounds loop for ringtone/dialing and play once for busy/hangup.
 */
class CallSoundManager {
  private audio: HTMLAudioElement | null = null;
  private currentSound: string | null = null;

  play(sound: 'ringtone' | 'dialing' | 'busy' | 'hangup') {
    // Stop current if playing
    this.stop();

    try {
      this.audio = new Audio(`/sounds/${sound}.mp3`);
      this.currentSound = sound;

      // Ringtone and dialing loop; busy and hangup play once
      if (sound === 'ringtone' || sound === 'dialing') {
        this.audio.loop = true;
      } else {
        this.audio.loop = false;
      }

      this.audio.volume = sound === 'hangup' ? 0.5 : 0.8;
      this.audio.play().catch(() => {
        // Browser may block autoplay — silently fail
        console.warn('[CallSound] Autoplay blocked for', sound);
      });
    } catch {
      console.warn('[CallSound] Failed to create audio for', sound);
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
      this.audio = null;
      this.currentSound = null;
    }
  }

  isPlaying(sound?: string): boolean {
    if (sound) return this.currentSound === sound;
    return this.currentSound !== null;
  }
}

export const callSound = new CallSoundManager();
