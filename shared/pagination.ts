/** Browsing is bounded; full exports use a separate streaming keyset reader. */
export const MAX_BROWSE_ROWS = 10_000;
export function browsePages(total: number, limit: number) {
  return Math.min(Math.ceil(total / limit), Math.floor(MAX_BROWSE_ROWS / limit));
}
