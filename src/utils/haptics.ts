export function triggerHaptic(ms: number = 15) {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      // A short vibration; some platforms ignore durations
      (navigator as any).vibrate?.(ms);
    }
  } catch {
    // noop
  }
}
