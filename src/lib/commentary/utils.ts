import type { CommentaryExcitementLevel } from '@/lib/commentary/types';

export function getExcitementLevel(
  totalScore: number,
  busted: boolean,
  is180: boolean,
  isHighScore: boolean
): CommentaryExcitementLevel {
  if (busted) {
    return 'low';
  }

  if (is180 || totalScore >= 140) {
    return 'high';
  }

  if (isHighScore || totalScore >= 80) {
    return 'medium';
  }

  if (totalScore <= 30) {
    return 'low';
  }

  return 'medium';
}
