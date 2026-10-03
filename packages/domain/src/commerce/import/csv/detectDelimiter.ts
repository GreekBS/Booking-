import type { CsvImportDelimiter } from "./constants";
import { CSV_IMPORT_DELIMITERS } from "./constants";

/**
 * Deterministic delimiter detection from the first non-empty line.
 * Scores comma / semicolon / tab outside quoted regions; highest unique score wins.
 * Falls back to comma when tied or empty.
 */
export function detectCsvDelimiter(text: string): CsvImportDelimiter {
  const line = firstContentLine(text);
  if (!line) return ",";

  const scores = new Map<CsvImportDelimiter, number>();
  for (const d of CSV_IMPORT_DELIMITERS) scores.set(d, 0);

  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (CSV_IMPORT_DELIMITERS as readonly string[]).includes(ch)) {
      const d = ch as CsvImportDelimiter;
      scores.set(d, (scores.get(d) ?? 0) + 1);
    }
  }

  let best: CsvImportDelimiter = ",";
  let bestScore = -1;
  let tie = false;
  for (const d of CSV_IMPORT_DELIMITERS) {
    const score = scores.get(d) ?? 0;
    if (score > bestScore) {
      best = d;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }

  if (bestScore <= 0 || tie) {
    // Prefer comma, then semicolon, then tab on tie/zero
    if ((scores.get(",") ?? 0) > 0) return ",";
    if ((scores.get(";") ?? 0) > 0) return ";";
    if ((scores.get("\t") ?? 0) > 0) return "\t";
    return ",";
  }
  return best;
}

function firstContentLine(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  for (const line of lines) {
    if (line.trim().length > 0) return line;
  }
  return "";
}
