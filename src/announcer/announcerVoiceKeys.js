/**
 * Expands announcer event voice definitions into deterministic runtime asset keys.
 * Events with zero variants are sting-only and contribute no voice keys.
 *
 * @param {Readonly<Record<string, { voice: { key: string, variants: number } }>>} events
 * @returns {string[]}
 */
export function expandAnnouncerVoiceKeys(events) {
  return Object.values(events).flatMap((event) => {
    const { key, variants } = event.voice;
    if (!Number.isInteger(variants) || variants < 0) {
      throw new RangeError(`Invalid announcer variant count for ${key}: ${variants}`);
    }
    return Array.from(
      { length: variants },
      (_, index) => `${key}_${String(index + 1).padStart(2, "0")}`,
    );
  });
}
