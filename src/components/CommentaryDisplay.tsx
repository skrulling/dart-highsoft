/**
 * CommentaryDisplay Component
 * Displays Chad's surfer-bro commentary with animations
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, SkipForward, Loader2 } from 'lucide-react';

interface CommentaryDisplayProps {
  commentary: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  onSkip: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  queueLength?: number;
}

export default function CommentaryDisplay({
  commentary,
  isLoading,
  isPlaying,
  onSkip,
  onToggleMute,
  isMuted,
  queueLength = 0,
}: CommentaryDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (commentary) {
      setIsVisible(true);
      // Auto-hide after 10 seconds if not playing
      const timeout = setTimeout(() => {
        if (!isPlaying) {
          setIsVisible(false);
        }
      }, 10000);

      return () => clearTimeout(timeout);
    }
  }, [commentary, isPlaying]);

  if (!commentary && !isLoading) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      {/* Speech Bubble */}
      <div
        className={`
          relative bg-gradient-to-br from-green-900 to-green-950
          text-green-100 p-4 rounded-lg shadow-2xl
          border-2 border-green-500
          transition-all duration-300 ease-in-out
          ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        {/* Chad Icon */}
        <div className="absolute -top-8 -left-8 text-5xl">
          🏄‍♂️
        </div>

        {/* Speaker Name */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-green-400 uppercase tracking-wider">
              Chad &quot;DartBroGPT&quot;
            </span>
            {isPlaying && (
              <div className="flex gap-1 items-center">
                <div className="w-1 h-3 bg-green-400 animate-pulse"></div>
                <div className="w-1 h-4 bg-green-400 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1 h-3 bg-green-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <button
              onClick={onToggleMute}
              className="p-1 hover:bg-green-800 rounded transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            {isPlaying && (
              <button
                onClick={onSkip}
                className="p-1 hover:bg-green-800 rounded transition-colors"
                title="Skip"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Commentary Text */}
        <div className="text-sm leading-relaxed">
          {isLoading ? (
            <div className="flex items-center gap-2 text-green-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="italic">Chad is thinking...</span>
            </div>
          ) : (
            <p className="font-medium">{commentary}</p>
          )}
        </div>

        {/* Queue Indicator */}
        {queueLength > 0 && (
          <div className="mt-2 text-xs text-green-400">
            +{queueLength} more in queue
          </div>
        )}

        {/* Speech Bubble Tail */}
        <div className="absolute -bottom-2 left-8 w-4 h-4 bg-green-950 border-r-2 border-b-2 border-green-500 transform rotate-45"></div>
      </div>
    </div>
  );
}
