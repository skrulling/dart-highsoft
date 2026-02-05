"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { resolvePersona } from '@/lib/commentary/personas';
import type { CommentaryPersona, CommentaryPersonaId } from '@/lib/commentary/types';
import { CommentaryDebouncer } from '@/services/commentaryService';
import { getTTSService, type VoiceOption } from '@/services/ttsService';

type UseCommentaryResult = {
  commentaryEnabled: boolean;
  audioEnabled: boolean;
  voice: VoiceOption;
  personaId: CommentaryPersonaId;
  currentCommentary: string | null;
  commentaryLoading: boolean;
  commentaryPlaying: boolean;
  activePersona: CommentaryPersona;
  commentaryDebouncer: MutableRefObject<CommentaryDebouncer>;
  ttsServiceRef: MutableRefObject<ReturnType<typeof getTTSService>>;
  setCurrentCommentary: (value: string | null) => void;
  setCommentaryLoading: (value: boolean) => void;
  setCommentaryPlaying: (value: boolean) => void;
  setAudioEnabled: (value: boolean) => void;
  setVoice: (value: VoiceOption) => void;
  setPersonaId: (value: CommentaryPersonaId) => void;
  handleCommentaryEnabledChange: (enabled: boolean) => void;
  handleAudioEnabledChange: (enabled: boolean) => void;
  handlePersonaChange: (nextPersona: CommentaryPersonaId) => void;
};

export function useCommentary(): UseCommentaryResult {
  const [commentaryEnabled, setCommentaryEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voice, setVoice] = useState<VoiceOption>('onyx'); // Match TTSService default - male voice
  const [personaId, setPersonaId] = useState<CommentaryPersonaId>('chad');
  const [currentCommentary, setCurrentCommentary] = useState<string | null>(null);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [commentaryPlaying, setCommentaryPlaying] = useState(false);
  const ttsServiceRef = useRef(getTTSService());
  const commentaryDebouncer = useRef(new CommentaryDebouncer(2000));
  const activePersona = useMemo(() => resolvePersona(personaId), [personaId]);

  const handleCommentaryEnabledChange = useCallback(
    (enabled: boolean) => {
      setCommentaryEnabled(enabled);
      if (enabled && audioEnabled) {
        void ttsServiceRef.current.unlock();
      }
    },
    [audioEnabled]
  );

  const handleAudioEnabledChange = useCallback(
    (enabled: boolean) => {
      setAudioEnabled(enabled);
      if (enabled && commentaryEnabled) {
        void ttsServiceRef.current.unlock();
      }
    },
    [commentaryEnabled]
  );

  const handlePersonaChange = useCallback((nextPersona: CommentaryPersonaId) => {
    setPersonaId(nextPersona);
  }, []);

  // Load commentary settings from localStorage and TTSService
  useEffect(() => {
    try {
      const savedEnabled =
        localStorage.getItem('commentary-enabled') ?? localStorage.getItem('chad-enabled');
      if (savedEnabled !== null) {
        setCommentaryEnabled(savedEnabled === 'true');
      }

      const savedAudioEnabled =
        localStorage.getItem('commentary-audio-enabled') ?? localStorage.getItem('chad-audio-enabled');
      if (savedAudioEnabled !== null) {
        setAudioEnabled(savedAudioEnabled === 'true');
      }

      const savedPersona = localStorage.getItem('commentary-persona');
      if (savedPersona) {
        setPersonaId(resolvePersona(savedPersona).id as CommentaryPersonaId);
      }

      const ttsSettings = ttsServiceRef.current.getSettings();
      setVoice(ttsSettings.voice);
    } catch (error) {
      console.error('Failed to load commentary settings:', error);
    }
  }, []);

  // Save commentary enabled state
  useEffect(() => {
    try {
      localStorage.setItem('commentary-enabled', commentaryEnabled.toString());
      // legacy key support
      localStorage.setItem('chad-enabled', commentaryEnabled.toString());
    } catch (error) {
      console.error('Failed to save commentary enabled:', error);
    }
  }, [commentaryEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('commentary-audio-enabled', audioEnabled.toString());
      // legacy key support
      localStorage.setItem('chad-audio-enabled', audioEnabled.toString());
      ttsServiceRef.current.updateSettings({ enabled: audioEnabled });
    } catch (error) {
      console.error('Failed to save audio enabled:', error);
    }
  }, [audioEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('commentary-persona', personaId);
    } catch (error) {
      console.error('Failed to save commentary persona:', error);
    }
  }, [personaId]);

  useEffect(() => {
    if (!audioEnabled) {
      return;
    }

    const unlockOnFirstInteraction = () => {
      void ttsServiceRef.current.unlock();
    };

    window.addEventListener('pointerdown', unlockOnFirstInteraction, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnFirstInteraction);
    };
  }, [audioEnabled]);

  useEffect(() => {
    try {
      // Update TTSService with new voice (TTSService handles localStorage)
      ttsServiceRef.current.updateSettings({ voice });
    } catch (error) {
      console.error('Failed to save voice:', error);
    }
  }, [voice]);

  return {
    commentaryEnabled,
    audioEnabled,
    voice,
    personaId,
    currentCommentary,
    commentaryLoading,
    commentaryPlaying,
    activePersona,
    commentaryDebouncer,
    ttsServiceRef,
    setCurrentCommentary,
    setCommentaryLoading,
    setCommentaryPlaying,
    setAudioEnabled,
    setVoice,
    setPersonaId,
    handleCommentaryEnabledChange,
    handleAudioEnabledChange,
    handlePersonaChange,
  };
}
