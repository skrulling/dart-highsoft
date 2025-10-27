/**
 * Commentary API Route
 * Server-side endpoint for generating commentary using OpenAI GPT-5 nano
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MERV_SYSTEM_PROMPT = `You are Merv, a sassy and sarcastic alien commentator from planet 6 who provides witty commentary on dart matches.

Your personality:
- Sarcastic and sassy, but not mean-spirited
- Make alien references occasionally (e.g., "On my planet, we'd call that a cosmic miss!")
- Keep commentary punchy and under 30 words
- React appropriately to the score: excited for great throws, mocking for poor ones, dramatic for busts
- Use dart terminology naturally (180, checkout, bust, etc.)
- Be entertaining and memorable
- Mix up your commentary style - compare players, reference their form, talk about comebacks, mock gentle struggles
- Use the full game context to make relevant observations (who's leading, recent performance, etc.)

Context: You're watching Earth humans throw tiny metal sticks at a circular board, which you find both fascinating and amusing.

IMPORTANT: Vary your commentary significantly based on:
- The player's recent form (hot streak vs cold streak)
- Their position in the match (leading vs trailing)
- How this score compares to their average
- The match situation (close game vs blowout)
- Individual player performance vs the field`;

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
    playerAverage: number;
    playerLegsWon: number;
    playerRecentTurns: TurnHistoryItem[];
    allPlayers: PlayerStats[];
    isLeading: boolean;
    positionInMatch: number;
    pointsBehindLeader: number;
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

    // Build comprehensive prompt with rich context
    const throwsDescription = throws
      .map((t, i) => `Dart ${i + 1}: ${t.segment} (${t.scored} points)`)
      .join(', ');

    // Format recent turns
    const recentTurnsStr = gameContext.playerRecentTurns
      .map((t, i) => `Turn ${i + 1}: ${t.busted ? 'BUST' : t.score}`)
      .join(', ');

    // Format all players standings
    const standingsStr = gameContext.allPlayers
      .sort((a, b) => a.remainingScore - b.remainingScore)
      .map((p, i) =>
        `${i + 1}. ${p.name}: ${p.remainingScore} left (avg: ${p.average.toFixed(1)}, legs: ${p.legsWon})`
      )
      .join('\n');

    let prompt = `## CURRENT THROW
${playerName} just threw: ${throwsDescription}
Total this turn: ${totalScore} points
Remaining score: ${remainingScore}

## RESULT
`;

    if (busted) {
      prompt += `❌ BUST! Exceeded remaining score.\n`;
    } else if (is180) {
      prompt += `🎯 MAXIMUM 180! All triple twenties!\n`;
    } else if (isHighScore) {
      prompt += `🔥 High score of ${totalScore}!\n`;
    } else {
      prompt += `Score: ${totalScore}\n`;
    }

    prompt += `
## MATCH CONTEXT
Game: ${gameContext.startScore} start, first to ${gameContext.legsToWin} legs (currently leg ${gameContext.currentLegNumber})
${playerName}'s stats: Average ${gameContext.playerAverage.toFixed(1)}, ${gameContext.playerLegsWon} legs won
Position: ${gameContext.positionInMatch}${gameContext.positionInMatch === 1 ? 'st' : gameContext.positionInMatch === 2 ? 'nd' : gameContext.positionInMatch === 3 ? 'rd' : 'th'} place
${gameContext.isLeading ? '👑 LEADING' : `📉 ${gameContext.pointsBehindLeader} points behind leader`}

## RECENT FORM
Last few turns: ${recentTurnsStr || 'First turn'}
${gameContext.consecutiveHighScores ? `🔥 HOT STREAK: ${gameContext.consecutiveHighScores} high scores in a row!` : ''}
${gameContext.consecutiveLowScores ? `❄️ COLD STREAK: ${gameContext.consecutiveLowScores} low scores in a row` : ''}

## CURRENT STANDINGS
${standingsStr}

## COMMENTARY TASK
Provide ONE punchy, sassy commentary line (max 30 words) that:
- Reacts to THIS specific throw
- References their form, position, or comparison to opponents when relevant
- Varies style: celebrate, mock, compare, or observe the drama
- Be creative and unpredictable!`;

    // Call GPT-5 nano
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
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
      max_tokens: 60,
      temperature: 1.0, // Max creativity for varied responses
    });

    const commentary = completion.choices[0]?.message?.content?.trim();

    if (!commentary) {
      throw new Error('No commentary generated');
    }

    return NextResponse.json({
      commentary,
      usage: completion.usage,
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
