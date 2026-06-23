// Turn arbitrary user input into a safe FTS5 MATCH expression.
// Each word becomes a prefix term (typeahead), all ANDed together.
// Non-alphanumeric characters are dropped so we never emit invalid FTS syntax.
export function ftsQuery(input: string): string {
  const tokens = (input.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])
    .filter((t) => t.length > 0)
    .slice(0, 12);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `${t}*`).join(' AND ');
}
