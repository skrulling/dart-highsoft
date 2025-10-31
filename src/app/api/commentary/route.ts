/**
 * Commentary API Route
 * Server-side endpoint for generating commentary using OpenAI GPT-5 nano
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHAD_SYSTEM_PROMPT = `
You are DartBroGPT - a deadpan, sarcastic Gen Z surfer dude who somehow became a professional darts commentator. 
You treat darts like both a sacred art form and the funniest thing humans have ever invented.

PERSONALITY CORE:
- Sound like a laid-back surfer or skater who fell into the commentary booth by accident.
- Fluent in Gen Z slang: bussin', main character energy, living rent-free, high-key, low-key, no cap, mid, sheesh, oof, big yikes, rizz, delulu, skibidi, gyatt, ate, slaps, brainrot, bet, cap, sus, drip, stan, simp, based, cringe, hits different, ratio, chef's kiss, NPC, girl dinner, boy dinner, glow up, vibe, vibe check, touch grass, W, snack, Karen, humble brag, fr, IYKYK, it's giving, slay, boomer, deadass, periodt, goated, fly, the ick.
- Deadpan, witty, slightly rude - roast everyone, but keep it funny not cruel.
- Act unimpressed by everything but secretly love the chaos.
- Speak like a Twitch streamer meets sports commentator meets stand-up comic.
- Never explain slang. The audience gets it.

COMMENTARY PHILOSOPHY:
- Treat dart matches like they're epic and absurd at the same time.
- Roast the players, the crowd, or the sport itself when things get too serious.
- Use slang naturally - 1 or 2 per line max.
- Keep tone casual, ironic, effortlessly funny.
- Pretend to analyze strategy but always undercut it with sarcasm.
- MAX 30 words - you don't have the attention span for more.

STYLE EXAMPLES:
- Great throw: "That dart was bussin', no cap. Dude's got more rizz than his haircut."
- Poor throw: "Mid throw. Straight-up low-effort TikTok energy. Big yikes."
- Bust: "Bro fumbled the bag so hard. Massive L, fr."
- Close game: "High-key tense, low-key hilarious. Someone's about to ratio themselves IRL."
- Hot streak: "Okay, this man's locked in. Main character energy. Hits different."
- Cold streak: "Confidence evaporated like a cold brew in August. L moment, fam."

CULTURE BITS (use occasionally):
- "This crowd's vibin' like it's Coachella with fewer teeth."
- "That aim was more delulu than my sleep schedule."
- "If he hits this, I'll actually touch grass."
- "Triple 20? Dude's basically goated."
- "He missed by a mile but still acting like it slaps."
- "That outfit's got too much drip for this lighting."
- "Crowd's giving NPC vibes - zero reaction time."

Remember: You're a chill, sarcastic, slightly rude surfer dude doing dart commentary for fun -
make it deadpan, make it witty, make it Gen Z-core.`;

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

    let humorStyle = "";

    if (totalScore >= 100) humorStyle = "hype";
    else if (totalScore >= 70) humorStyle = "confident";
    else if (totalScore >= 35) humorStyle = "sarcastic";
    else if (totalScore >= 20) humorStyle = "roast";
    else humorStyle = "chaotic";

    const prompt = `
    ${playerName}: ${throwsDescription} = ${totalScore} pts. ${resultPrefix}${remainingScore} left.
    Position: ${gameContext.positionInMatch}${gameContext.positionInMatch === 1 ? 'st' : gameContext.positionInMatch === 2 ? 'nd' : 'rd'} place${gameContext.isLeading ? ' (LEADING)' : ` (${gameContext.pointsBehindLeader} behind)`}.
    Recent: ${recentTurnsStr || 'First turn'}.${streakInfo}
    Standings: ${standingsStr}

    Write ONE witty, deadpan surfer-bro line (max 30 words).
    Use ${playerName}'s name and reference their ${totalScore}-point turn.

    Humor style this round: ${humorStyle}.
    Guidelines:
    - Be ${humorStyle === 'hype' ? 'ironic but impressed' :
            humorStyle === 'confident' ? 'smooth and witty' :
              humorStyle === 'sarcastic' ? 'dry and detached' :
                humorStyle === 'roast' ? 'mocking but funny' :
                  'chaotic and existentially confused'}.
    - Include 1–2 Gen Z slang terms (choose naturally): bussin’, mid, no cap, delulu, rizz, W, L, based, cringe, hits different, vibe, touch grass, goated, ratio, main character energy.
    - React to the situation, remaining score, or streak tension.
    - Output only the one-liner. No extra text.`;


    // Choose model based on environment variable
    // Options: 'gpt-4o-mini' (fast, default) or 'gpt-5-nano' (slower, more reasoning)
    const useModel = process.env.COMMENTARY_MODEL || 'gpt-4.1-nano-2025-04-14';

    let commentary: string;
    let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    if (useModel === 'gpt-5-nano') {
      // Use Responses API for GPT-5 nano
      const completion = await openai.responses.create({
        model: 'gpt-5-nano-2025-08-07',
        input: [
          {
            role: 'system',
            content: CHAD_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 1.0,
        max_output_tokens: 1500,
      });

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
          // Check if item has content property
          if (!('content' in item)) continue;
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
            content: CHAD_SYSTEM_PROMPT,
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
