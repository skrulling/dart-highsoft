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

type VoiceOption = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse';

interface TTSRequest {
  text: string;
  voice?: VoiceOption;
  speed?: number;
  personaId?: CommentaryPersonaId;
  excitement?: CommentaryExcitementLevel;
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
    const validVoices: VoiceOption[] = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'];
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
    const combinedInput = buildSpeechInput(personaId, excitement, speed, text);

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1', // Using cheapest TTS model
      voice,
      input: combinedInput,
      speed,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

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

function buildInstructions(
  personaId: CommentaryPersonaId,
  excitement: CommentaryExcitementLevel,
  speed: number
): string {
  const tempoNote = speed !== 1 ? `Keep your delivery paced for roughly ${speed.toFixed(2)}x playback.` : 'Maintain natural tempo.';

  if (personaId === 'bob') {
    const excitementNotes = {
      high: 'Sound thrilled yet polished, brighten the tone and punch key phrases.',
      medium: 'Keep a warm, confident booth energy.',
      low: 'Stay composed and understated, classic British reserve.',
    } as const;

    return `You are Bob "Steel-Tip" Harrison, an English darts commentator. Speak in a clear British broadcast accent with rich stage presence. ${excitementNotes[excitement]} ${tempoNote}`;
  }

  const excitementNotes = {
    high: 'Let some stoke through the mic but stay smooth and relaxed.',
    medium: 'Keep the chill California surfer vibe with a friendly lift.',
    low: 'Stay laid-back and mellow, minimal hype.',
  } as const;

  return `You are Chad, a California surfer-style darts commentator. Use a relaxed West Coast surfer accent with easygoing charm. ${excitementNotes[excitement]} ${tempoNote}`;
}

function buildSpeechInput(
  personaId: CommentaryPersonaId,
  excitement: CommentaryExcitementLevel,
  speed: number,
  text: string
): string {
  const instructions = buildInstructions(personaId, excitement, speed);
  return `${instructions}\n\n${text}`;
}
