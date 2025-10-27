/**
 * Text-to-Speech Service
 * Handles audio generation and playback using OpenAI TTS API
 */

export type VoiceOption = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface TTSSettings {
  voice: VoiceOption;
  speed: number; // 0.25 to 4.0, default 1.0
  volume: number; // 0 to 100
  enabled: boolean;
}

export interface AudioQueueItem {
  text: string;
  audioUrl?: string;
  timestamp: number;
}

/**
 * TTS Service for managing audio generation and playback
 */
export class TTSService {
  private audioQueue: AudioQueueItem[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private isPlaying: boolean = false;
  private settings: TTSSettings;
  private maxQueueSize: number = 3;

  constructor(settings?: Partial<TTSSettings>) {
    this.settings = {
      voice: 'fable',
      speed: 1.1,
      volume: 70,
      enabled: true,
      ...settings,
    };

    // Load settings from localStorage if available
    if (typeof window !== 'undefined') {
      this.loadSettings();
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('merv-tts-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load TTS settings:', error);
    }
  }

  /**
   * Save settings to localStorage
   */
  private saveSettings(): void {
    try {
      localStorage.setItem('merv-tts-settings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save TTS settings:', error);
    }
  }

  /**
   * Update TTS settings
   */
  updateSettings(settings: Partial<TTSSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.saveSettings();

    // Update volume of current audio if playing
    if (this.currentAudio) {
      this.currentAudio.volume = this.settings.volume / 100;
    }
  }

  getSettings(): TTSSettings {
    return { ...this.settings };
  }

  /**
   * Generate speech audio from text via API
   */
  async generateSpeech(text: string): Promise<string | undefined> {
    try {
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        body: JSON.stringify({
          text,
          voice: this.settings.voice,
          speed: this.settings.speed,
          timestamp, // Force unique request
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      // Get the audio blob
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      return audioUrl;
    } catch (error) {
      console.error('Failed to generate speech:', error);
      return undefined;
    }
  }

  /**
   * Add commentary to the audio queue
   */
  async queueCommentary(text: string): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }

    // Limit queue size
    if (this.audioQueue.length >= this.maxQueueSize) {
      // Remove oldest item and revoke its URL
      const removed = this.audioQueue.shift();
      if (removed?.audioUrl) {
        URL.revokeObjectURL(removed.audioUrl);
      }
    }

    const item: AudioQueueItem = {
      text,
      timestamp: Date.now(),
    };

    this.audioQueue.push(item);

    // Start processing queue if not already playing
    if (!this.isPlaying) {
      await this.processQueue();
    }
  }

  /**
   * Process the audio queue
   */
  private async processQueue(): Promise<void> {
    if (this.isPlaying || this.audioQueue.length === 0) {
      return;
    }

    this.isPlaying = true;

    while (this.audioQueue.length > 0) {
      const item = this.audioQueue[0];

      // Generate audio if not already generated
      if (!item.audioUrl) {
        item.audioUrl = await this.generateSpeech(item.text);
        if (!item.audioUrl) {
          // Failed to generate, remove from queue
          this.audioQueue.shift();
          continue;
        }
      }

      // Play the audio
      await this.playAudio(item.audioUrl);

      // Clean up
      URL.revokeObjectURL(item.audioUrl);
      this.audioQueue.shift();
    }

    this.isPlaying = false;
  }

  /**
   * Play an audio URL
   */
  private playAudio(audioUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.volume = this.settings.volume / 100;

      audio.onended = () => {
        this.currentAudio = null;
        resolve();
      };

      audio.onerror = (error) => {
        this.currentAudio = null;
        console.error('Audio playback error:', error);
        reject(error);
      };

      this.currentAudio = audio;
      audio.play().catch((error) => {
        console.error('Failed to play audio:', error);
        this.currentAudio = null;
        reject(error);
      });
    });
  }

  /**
   * Skip the current commentary
   */
  skipCurrent(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    // Clean up URLs
    this.audioQueue.forEach((item) => {
      if (item.audioUrl) {
        URL.revokeObjectURL(item.audioUrl);
      }
    });

    this.audioQueue = [];

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    this.isPlaying = false;
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.audioQueue.length;
  }

  /**
   * Cleanup on unmount
   */
  destroy(): void {
    this.clearQueue();
  }
}

// Singleton instance for global use
let ttsServiceInstance: TTSService | null = null;

/**
 * Get the global TTS service instance
 */
export function getTTSService(): TTSService {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TTSService();
  }
  return ttsServiceInstance;
}
