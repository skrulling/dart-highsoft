/**
 * MervSettings Component
 * Settings panel for controlling Merv's commentary
 */

'use client';

import React from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { VoiceOption } from '@/services/ttsService';

interface MervSettingsProps {
  enabled: boolean;
  audioEnabled: boolean;
  voice: VoiceOption;
  onEnabledChange: (enabled: boolean) => void;
  onAudioEnabledChange: (enabled: boolean) => void;
  onVoiceChange: (voice: VoiceOption) => void;
}

const VOICE_OPTIONS: { value: VoiceOption; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'Neutral (androgynous)' },
  { value: 'echo', label: 'Echo', description: 'Male - clear and articulate' },
  { value: 'fable', label: 'Fable', description: 'Female - warm and expressive' },
  { value: 'onyx', label: 'Onyx', description: 'Male - deep and authoritative' },
  { value: 'nova', label: 'Nova', description: 'Female - friendly and energetic' },
  { value: 'shimmer', label: 'Shimmer', description: 'Female - soft and soothing' },
];

export default function MervSettings({
  enabled,
  audioEnabled,
  voice,
  onEnabledChange,
  onAudioEnabledChange,
  onVoiceChange,
}: MervSettingsProps) {
  const currentVoice = VOICE_OPTIONS.find((v) => v.value === voice) || VOICE_OPTIONS[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-lg">👽</span>
          <span>Merv</span>
          <Settings className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="text-2xl">👽</span>
          <div>
            <div className="font-semibold">Merv Commentary</div>
            <div className="text-xs text-muted-foreground font-normal">
              Sassy alien from Planet 6
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Enable/Disable Toggle */}
        <div className="px-2 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="merv-enabled" className="text-sm font-medium">
              Enable Commentary
            </Label>
            <Switch
              id="merv-enabled"
              checked={enabled}
              onCheckedChange={onEnabledChange}
            />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="merv-audio" className="text-sm font-medium">
                  Enable Audio
                </Label>
                <Switch
                  id="merv-audio"
                  checked={audioEnabled}
                  onCheckedChange={onAudioEnabledChange}
                />
              </div>

              <DropdownMenuSeparator />

              {/* Voice Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Voice</Label>
                <div className="text-xs text-muted-foreground mb-1">
                  Current: {currentVoice.label} - {currentVoice.description}
                </div>
              </div>
            </>
          )}
        </div>

        {enabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Select Voice
            </DropdownMenuLabel>
            {VOICE_OPTIONS.map((voiceOption) => (
              <DropdownMenuItem
                key={voiceOption.value}
                onClick={() => onVoiceChange(voiceOption.value)}
                className={voice === voiceOption.value ? 'bg-accent' : ''}
              >
                <div className="flex flex-col">
                  <div className="font-medium">{voiceOption.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {voiceOption.description}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-xs text-muted-foreground">
          Powered by OpenAI GPT-5 nano
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
