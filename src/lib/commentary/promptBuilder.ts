import type { CommentaryPersona, CommentaryPayload } from './types';
import { computeDartIQ, humorStyleFromScore } from './insights';

interface PromptBuildOptions {
  persona: CommentaryPersona;
  random?: () => number;
}

export interface PromptBuildResult {
  prompt?: string;
  plainLine?: string;
  allowSlang: boolean;
  humorStyle: ReturnType<typeof humorStyleFromScore>;
}

export function buildCommentaryPrompt(
  payload: CommentaryPayload,
  options: PromptBuildOptions
): PromptBuildResult {
  const { persona } = options;
  const rng = options.random ?? Math.random;
  const style = persona.style;

  if (rng() < style.plainLineProbability) {
    return {
      plainLine: `${payload.playerName} scores ${payload.totalScore}; ${payload.remainingScore} left.`,
      allowSlang: false,
      humorStyle: humorStyleFromScore(payload.totalScore),
    };
  }

  const { gameContext } = payload;
  const throwsDescription = payload.throws
    .map((t, i) => `Dart ${i + 1}: ${t.segment} (${t.scored})`)
    .join(', ');

  const recentTurnsStr = gameContext.playerRecentTurns
    .map((t) => (t.busted ? 'BUST' : t.score))
    .join(', ');

  const standingsStr = gameContext.allPlayers
    .slice()
    .sort((a, b) => a.remainingScore - b.remainingScore)
    .map((p) => `${p.name}: ${p.remainingScore} (avg ${p.average.toFixed(1)})`)
    .join(' | ');

  let resultPrefix = '';
  if (payload.busted) {
    resultPrefix = 'BUST! ';
  } else if (payload.is180) {
    resultPrefix = '180! ';
  } else if (payload.isHighScore) {
    resultPrefix = `${payload.totalScore}! `;
  }

  const streakInfo = gameContext.consecutiveHighScores
    ? ` HOT: ${gameContext.consecutiveHighScores} in a row.`
    : gameContext.consecutiveLowScores
      ? ` COLD: ${gameContext.consecutiveLowScores} in a row.`
      : '';

  const iq = computeDartIQ({
    remainingScore: payload.remainingScore,
    totalScore: payload.totalScore,
    busted: payload.busted,
    dartsUsedThisTurn: gameContext.dartsUsedThisTurn,
  });

  const iqHints: string[] = [];
  if (iq.isBogey) iqHints.push(`${payload.remainingScore} is a bogey leave.`);
  if (iq.inCheckout && !iq.isBogey) iqHints.push('Checkout range (≤170).');
  if (iq.onDouble) iqHints.push(`Sitting on double ${payload.remainingScore / 2}.`);
  else if (iq.twoDart) iqHints.push(`${payload.remainingScore} is a two-dart finish.`);
  if (iq.maxOut) iqHints.push('170 checkout is live.');
  if (iq.setupShot) iqHints.push('Visit looked like a setup shot.');
  if (iq.bust) iqHints.push(`Bust resets to ${payload.remainingScore}.`);

  const allowSlang = rng() < style.slangUseProbability;
  const humorStyle = humorStyleFromScore(payload.totalScore);

  const ordinalPosition = formatOrdinal(gameContext.positionInMatch);
  const positionLine = `Position: ${ordinalPosition} place${gameContext.isLeading ? ' (leading)' : ` (${gameContext.pointsBehindLeader} behind)`}.`;

  const slangTermLabel = style.maxSlangPerLine === 1 ? 'term' : 'terms';

  const prompt = `
${payload.playerName}: ${throwsDescription} = ${payload.totalScore} pts. ${resultPrefix}${payload.remainingScore} left.
${positionLine}
Recent: ${recentTurnsStr || 'First turn'}.${streakInfo}
Standings: ${standingsStr || 'No standings available.'}

IQ hints: ${iqHints.length ? iqHints.join(' ') : 'none'}

Write ONE deadpan, concise line (≤ ${style.maxWords} words).
Use ${payload.playerName}'s name and reference their ${payload.totalScore}-point turn or current checkout situation.

Humor style: ${humorStyle}.
Tone guide:
- hype-lite: impressed but calm
- confident-dry: composed credit
- neutral-dry: matter-of-fact
- roast-lite: gentle ribbing, not mean
- wry-quiet: minimal, resigned humor

Slang policy: ${allowSlang ? `optional (≤${style.maxSlangPerLine} natural ${slangTermLabel}).` : 'avoid all slang this line.'}
Stay clear of hashtags, emojis, or filler catchphrases.
Prioritize dart intelligence (bogeys, checkout pressure, doubles, busts, setup leaves) over jokes.
Be informative first, witty second. Output only the one-liner.`;

  return { prompt, allowSlang, humorStyle };
}

function formatOrdinal(value: number): string {
  const absValue = Math.abs(value);
  const remainder = absValue % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }
  switch (absValue % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
