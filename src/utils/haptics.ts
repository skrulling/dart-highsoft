export function triggerHaptic(ms: number = 15) {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      // A short vibration; some platforms ignore durations
      const vib = (navigator as unknown as { vibrate?: (pattern: number | number[]) => boolean }).vibrate;
      vib?.(ms);
    }
  } catch {
    // noop
  }
}
