/*
 * CSV writing, shared by every export. One escaping rule everywhere: quote a
 * cell only when it contains a comma, quote, or newline, and double the quotes.
 */
export const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(",");

/** A `# key,value` header line — the self-describing block every export opens with. */
export const csvNote = (key: string, ...values: unknown[]): string => `# ${csvRow([key, ...values])}`;
