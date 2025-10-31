/**
 * CommentarySettings Component
 * Persona selector + audio controls for dart commentary
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
import { COMMENTARY_PERSONA_LIST, resolvePersona } from '@/lib/commentary/personas';
import type { CommentaryPersonaId } from '@/lib/commentary/types';

interface CommentarySettingsProps {
  enabled: boolean;
  audioEnabled: boolean;
  voice: VoiceOption;
  personaId: CommentaryPersonaId;
  onEnabledChange: (enabled: boolean) => void;
  onAudioEnabledChange: (enabled: boolean) => void;
  onVoiceChange: (voice: VoiceOption) => void;
  onPersonaChange: (persona: CommentaryPersonaId) => void;
}

const VOICE_OPTIONS: { value: VoiceOption; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'Neutral (androgynous)' },
  { value: 'ash', label: 'Ash', description: 'Male - casual and conversational' },
  { value: 'ballad', label: 'Ballad', description: 'Female - smooth and melodic' },
  { value: 'coral', label: 'Coral', description: 'Female - bright and engaging' },
  { value: 'echo', label: 'Echo', description: 'Male - clear and articulate' },
  { value: 'fable', label: 'Fable', description: 'Female - warm and expressive' },
  { value: 'onyx', label: 'Onyx', description: 'Male - deep and authoritative' },
  { value: 'nova', label: 'Nova', description: 'Female - friendly and energetic' },
  { value: 'sage', label: 'Sage', description: 'Male - calm and composed' },
  { value: 'shimmer', label: 'Shimmer', description: 'Female - soft and soothing' },
  { value: 'verse', label: 'Verse', description: 'Male - dynamic and expressive' },
];

export default function CommentarySettings({
  enabled,
  audioEnabled,
  voice,
  personaId,
  onEnabledChange,
  onAudioEnabledChange,
  onVoiceChange,
  onPersonaChange,
}: CommentarySettingsProps) {
  const currentVoice = VOICE_OPTIONS.find((v) => v.value === voice) || VOICE_OPTIONS[2];
  const activePersona = resolvePersona(personaId);
  const personaOptions = COMMENTARY_PERSONA_LIST;
  const buttonLabel = activePersona.label.split(' ')[0] ?? activePersona.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-lg">{activePersona.avatar}</span>
          <span>{buttonLabel}</span>
          <Settings className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <span className="text-2xl">{activePersona.avatar}</span>
          <div>
            <div className="font-semibold">{activePersona.label}</div>
            <div className="text-xs text-muted-foreground font-normal">
              {activePersona.description}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Enable/Disable Toggle */}
        <div className="px-2 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="commentary-enabled" className="text-sm font-medium">
              Enable Commentary
            </Label>
            <Switch
              id="commentary-enabled"
              checked={enabled}
              onCheckedChange={onEnabledChange}
            />
          </div>

          {enabled && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="commentary-audio" className="text-sm font-medium">
                  Enable Audio
                </Label>
                <Switch
                  id="commentary-audio"
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

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Select Commentator
        </DropdownMenuLabel>
        {personaOptions.map((persona) => (
          <DropdownMenuItem
            key={persona.id}
            onClick={() => onPersonaChange(persona.id)}
            className={persona.id === personaId ? 'bg-accent' : ''}
          >
            <div className="flex gap-3">
              <span className="text-2xl" aria-hidden>{persona.avatar}</span>
              <div className="flex flex-col">
                <div className="font-medium leading-tight">{persona.label}</div>
                <div className="text-xs text-muted-foreground leading-tight">
                  {persona.description}
                </div>
              </div>
            </div>
          </DropdownMenuItem>
        ))}

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
