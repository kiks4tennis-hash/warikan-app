export type ReceiptGuess = { title: string; amountText: string; rawText: string };

/** Conservative receipt heuristic: the user always reviews and confirms OCR results. */
export function guessReceiptFields(rawText: string): ReceiptGuess {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const totalLine = lines.find((line) => /(合計|総額|お会計|total|amount due)/i.test(line));
  const candidates = (totalLine ? [totalLine, ...lines] : lines)
    .map((line) => ({ line, matches: [...line.matchAll(/(?:¥|￥|JPY\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)] }))
    .flatMap(({ line, matches }) => matches.map((match) => ({ line, amount: Number(match[1].replace(/,/g, '')), preferred: /(合計|総額|お会計|total|amount due)/i.test(line) })))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  candidates.sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.amount - a.amount);
  const firstTextLine = lines.find((line) => !/(合計|総額|お会計|total|amount|\d{4}[年/-]\d{1,2})/i.test(line) && !/^\d+$/.test(line));
  return {
    title: firstTextLine?.slice(0, 80) ?? 'レシート支出',
    amountText: candidates[0] ? String(candidates[0].amount) : '',
    rawText,
  };
}

