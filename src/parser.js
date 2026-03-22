/**
 * Parses the game's formatted number strings back to numeric values.
 * Handles suffixes: K (x1000), M (x1000000).
 * Handles optional +/- prefix.
 * Returns null if the input cannot be parsed.
 */
export function parseNumber(str) {
  if (str == null) return null;
  str = String(str).trim();
  if (str === "") return null;

  const match = str.match(/^([+-]?)(\d+(?:\.\d+)?)\s*([KkMm]?)$/);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const num = parseFloat(match[2]);
  const suffix = match[3].toUpperCase();

  const multiplier = suffix === "M" ? 1_000_000 : suffix === "K" ? 1_000 : 1;
  return sign * Math.round(num * multiplier);
}

/**
 * Parses current and max troop display strings into numbers.
 */
export function parseTroopText(currentStr, maxStr) {
  const current = parseNumber(currentStr);
  const max = parseNumber(maxStr);
  if (current == null || max == null) return null;
  return { current, max };
}

/**
 * Parses the troop rate display string.
 * Format: "+25.0K/s" -> 25000
 */
export function parseRateText(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/\/s\s*$/, "").trim();
  return parseNumber(cleaned);
}

/**
 * Parses the attack ratio label text.
 * Format: "20% (12.5K)" -> { percent: 20, troops: 12500 }
 */
export function parseAttackRatioText(str) {
  if (str == null) return null;
  const match = String(str).match(/^(\d+)%\s*\(([^)]+)\)$/);
  if (!match) return null;
  const percent = parseInt(match[1], 10);
  const troops = parseNumber(match[2]);
  if (troops == null) return null;
  return { percent, troops };
}
