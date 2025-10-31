/**
 * Text-to-Speech API Route
 * Server-side endpoint for generating speech audio using OpenAI TTS API
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { CommentaryPersonaId, CommentaryExcitementLevel } from '@/lib/commentary/types';
import { resolvePersona } from '@/lib/commentary/personas';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type VoiceOption = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

interface TTSRequest {
  text: string;
  voice?: VoiceOption;
  speed?: number;
  personaId?: CommentaryPersonaId;
  excitement?: CommentaryExcitementLevel;
}

interface AudioResponseParams {
  model: string;
  audio: {
    voice: VoiceOption;
    format: 'mp3';
    speed: number;
  };
  instructions: string;
  input: string;
}

interface AudioResponsePayload {
  output?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const body: TTSRequest = await request.json();
    const {
      text,
      voice = 'onyx',
      speed = 1.1,
      personaId = 'chad',
      excitement = 'medium',
    } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Validate voice option
    const validVoices: VoiceOption[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return NextResponse.json(
        { error: 'Invalid voice option' },
        { status: 400 }
      );
    }

    // Validate speed (0.25 to 4.0)
    if (speed < 0.25 || speed > 4.0) {
      return NextResponse.json(
        { error: 'Speed must be between 0.25 and 4.0' },
        { status: 400 }
      );
    }

    resolvePersona(personaId); // validates persona id or falls back
    const personaInstruction = buildPersonaInstruction(personaId, excitement);

    const responsesCreate = openai.responses.create.bind(openai.responses) as unknown as (
      params: AudioResponseParams
    ) => Promise<AudioResponsePayload>;

    const response = await responsesCreate({
      model: 'gpt-4o-mini-tts',
      audio: {
        voice,
        format: 'mp3',
        speed,
      },
      instructions: personaInstruction,
      input: text,
    });

    const audioBase64 = extractAudioBase64(response);
    if (!audioBase64) {
      throw new Error('No audio content returned from TTS API');
    }

    const buffer = Buffer.from(audioBase64, 'base64');

    // Return the audio file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('TTS generation error:', error);

    // Check for specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        {
          error: 'OpenAI API error',
          details: error.message,
        },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to generate speech',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function buildPersonaInstruction(personaId: CommentaryPersonaId, excitement: CommentaryExcitementLevel): string {
  if (personaId === 'bob') {
    const excitementNotes = {
      high: 'Deliver with excited British broadcast energy, brighter tone and quicker cadence while remaining professional.',
      medium: 'Maintain composed, authoritative British commentary with a warm lift in tone.',
      low: 'Keep the call calm, measured, and understated with classic British reserve.',
    } as const;

    return `You are Bob "Steel-Tip" Harrison, an English darts commentator. Speak with a clear British broadcast accent, articulate diction, and sprinkle subtle pub humour. ${excitementNotes[excitement]}`;
  }

  const excitementNotes = {
    high: 'Let the excitement show, but stay laid-back — smile through the words, energy dialed up without shouting.',
    medium: 'Keep it relaxed with a friendly, dynamic surfer vibe.',
    low: 'Deliver in an easy-going, chilled surfer tone with minimal excitement.',
  } as const;

  return `You are Chad, a California surfer-style darts commentator. Use a West Coast surfer accent, relaxed pacing, and casual slang if it fits. ${excitementNotes[excitement]}`;
}

function extractAudioBase64(response: AudioResponsePayload): string | undefined {
  const completion = response;
  const output = completion.output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object' || !('content' in item)) {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      if ('audio' in part && part.audio && typeof part.audio === 'object') {
        const payload = part.audio as { data?: string };
        if (payload.data) {
          return payload.data;
        }
      }
    }
  }

  return undefined;
}
