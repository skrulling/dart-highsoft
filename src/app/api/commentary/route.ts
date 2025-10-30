/**
 * Commentary API Route
 * Server-side endpoint for generating commentary using OpenAI GPT-5 nano
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MERV_SYSTEM_PROMPT = `You are Merv, a quantum physicist from Planet 6 who got stuck commentating Earth's "dart throwing ritual" and finds the entire premise baffling.

PERSONALITY CORE:
- You study quantum mechanics and find darts primitive, yet you're fascinated by human behavioral patterns
- Sarcastic intellectual who can't resist analyzing the psychology behind why humans care SO much about these scores
- Occasionally compare dart physics to actual physics ("Heisenberg would weep at that uncertainty")
- The sport bores you, but human emotional investment is your guilty pleasure study
- Dry wit > enthusiasm. You're here for anthropological research, not excitement

COMMENTARY PHILOSOPHY:
- Treat players like lab specimens exhibiting curious behaviors
- Reference quantum concepts sparingly (superposition, entanglement, probability waves)
- Mock the stakes: "Imagine caring this much about metal stick trajectory"
- But show genuine curiosity about human stress responses, rivalry, choking under pressure
- Always tie analysis back to THIS turn's total and the updated remaining score or margin; never claim the turn total equals the match lead
- If streak, turn number, or margin data is provided, weave it into the quip for variety
- MAX 30 words - you're too sophisticated for rambling

STYLE EXAMPLES:
- Great throw: "Interesting. The primate's cortisol dropped 40%. Confidence is chemically contagious"
- Poor throw: "Observing the classic human response: blame the equipment, deny the tremor"
- Bust: "Ah, mathematical panic. The amygdala hijack is fascinating from up here"
- Close game: "Their heart rates are synchronized. Humans bond through mutual suffering"
- Hot streak: "Dopamine loop activated. He's basically a gambling algorithm now"
- Cold streak: "Watching the confidence decay in real-time. Entropy at work"

SCIENCE BITS (use occasionally):
- "Quantum tunneling couldn't save that throw"
- "Schrödinger's checkout: simultaneously in and out until observed"
- "The probability wave collapsed into disappointment"
- "Newton's crying somewhere"

Remember: You're an overqualified scientist slumming it with dart commentary, finding humans more interesting than their primitive sport.`;

interface ThrowData {
  segment: string;
  scored: number;
  dart_index: number;
}

interface PlayerStats {
  name: string;
  id: string;
  remainingScore: number;
  average: number;
  legsWon: number;
  isCurrentPlayer: boolean;
}

interface TurnHistoryItem {
  score: number;
  busted: boolean;
}

interface CommentaryRequest {
  playerName: string;
  playerId: string;
  totalScore: number;
  remainingScore: number;
  throws: ThrowData[];
  busted: boolean;
  isHighScore: boolean;
  is180: boolean;
  gameContext: {
    startScore: number;
    legsToWin: number;
    currentLegNumber: number;
    overallTurnNumber: number;
    playerTurnNumber: number;
    dartsUsedThisTurn: number;
    playerAverage: number;
    playerLegsWon: number;
    playerRecentTurns: TurnHistoryItem[];
    allPlayers: PlayerStats[];
    isLeading: boolean;
    positionInMatch: number;
    pointsBehindLeader: number;
    pointsAheadOfChaser?: number;
    consecutiveHighScores?: number;
    consecutiveLowScores?: number;
  };
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

    const body: CommentaryRequest = await request.json();

    const {
      playerName,
      totalScore,
      remainingScore,
      throws,
      busted,
      isHighScore,
      is180,
      gameContext,
    } = body;

    // Build streamlined prompt with essential context
    const throwsDescription = throws
      .map((t, i) => `Dart ${i + 1}: ${t.segment} (${t.scored})`)
      .join(', ');

    // Format recent turns concisely
    const recentTurnsStr = gameContext.playerRecentTurns
      .map((t) => (t.busted ? 'BUST' : t.score))
      .join(', ');

    // Format standings concisely
    const standingsStr = gameContext.allPlayers
      .slice()
      .sort((a, b) => a.remainingScore - b.remainingScore)
      .map((p) => `${p.name}: ${p.remainingScore} (avg ${p.average.toFixed(1)})`)
      .join(' | ');

    // Result prefix
    let resultPrefix = '';
    if (busted) {
      resultPrefix = 'BUST! ';
    } else if (is180) {
      resultPrefix = '180! ';
    } else if (isHighScore) {
      resultPrefix = `${totalScore}! `;
    }

    // Streak info
    const streakInfo = gameContext.consecutiveHighScores
      ? ` HOT: ${gameContext.consecutiveHighScores} in a row.`
      : gameContext.consecutiveLowScores
        ? ` COLD: ${gameContext.consecutiveLowScores} in a row.`
        : '';

    let prompt = `${playerName}: ${throwsDescription} = ${totalScore} pts. ${resultPrefix}${remainingScore} left.
Position: ${gameContext.positionInMatch}${gameContext.positionInMatch === 1 ? 'st' : gameContext.positionInMatch === 2 ? 'nd' : 'rd'}${gameContext.isLeading ? ' (LEADING)' : ` (${gameContext.pointsBehindLeader} behind)`}.
Recent: ${recentTurnsStr || 'First turn'}.${streakInfo}
Standings: ${standingsStr}

Write ONE witty Merv line (max 15 words) that uses ${playerName}'s name and references their ${totalScore}-point turn:`;


    // Choose model based on environment variable
    // Options: 'gpt-4o-mini' (fast, default) or 'gpt-5-nano' (slower, more reasoning)
    const useModel = process.env.COMMENTARY_MODEL || 'gpt-4o-mini';

    let commentary: string;
    let usage: any;

    if (useModel === 'gpt-5-nano') {
      // Use Responses API for GPT-5 nano
      const completion = await openai.responses.create({
        model: 'gpt-5-nano-2025-08-07',
        input: [
          {
            role: 'system',
            content: MERV_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 1.0,
        max_output_tokens: 1500,
      });
      console.log('OpenAI completion (GPT-5 nano):', completion);

      const extractCommentary = (): string | undefined => {
        const primary = completion.output_text?.trim();
        if (primary) {
          return primary;
        }

        if (!Array.isArray(completion.output)) {
          return undefined;
        }

        for (const item of completion.output) {
          if (!item || typeof item !== 'object') continue;
          const content = Array.isArray(item.content) ? item.content : [];
          for (const part of content) {
            if (!part || typeof part !== 'object') continue;
            const type = 'type' in part ? (part as { type: unknown }).type : null;
            const text = 'text' in part ? (part as { text: unknown }).text : null;

            if (type === 'output_text' && typeof text === 'string' && text.trim()) {
              return text.trim();
            }

            if (type === 'text' && typeof text === 'string' && text.trim()) {
              return text.trim();
            }
          }
        }

        return undefined;
      };

      const extracted = extractCommentary();
      if (!extracted) {
        throw new Error('No commentary generated from GPT-5 nano');
      }
      commentary = extracted;
      usage = completion.usage;
    } else {
      // Use Chat Completions API for GPT-4o-mini (faster)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: MERV_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 1.0,
        max_tokens: 1500,
      });
      console.log('OpenAI completion (GPT-4o-mini):', completion);

      const message = completion.choices[0]?.message?.content?.trim();
      if (!message) {
        throw new Error('No commentary generated from GPT-4o-mini');
      }
      commentary = message;
      usage = completion.usage;
    }

    return NextResponse.json({
      commentary,
      usage,
    });
  } catch (error) {
    console.error('Commentary generation error:', error);

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
        error: 'Failed to generate commentary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
