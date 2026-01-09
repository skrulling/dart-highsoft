export function decorateAvg(avg: number): { cls: string; emoji: string } {
  if (avg > 60) return { cls: 'text-purple-600', emoji: '👑' };
  if (avg >= 40) return { cls: 'text-green-600', emoji: '🙂' };
  if (avg >= 32) return { cls: 'text-muted-foreground', emoji: '😐' };
  return { cls: 'text-red-600', emoji: '🙁' };
}
