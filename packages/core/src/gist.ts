/** A key takeaway is a short claim, not a keyword list. */
export const GIST_MIN_WORDS = 4;
export const GIST_MAX_WORDS = 10;
export const GIST_MAX_CHARS = 120;

const GIST_UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/;

export function gistWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Shape rules shared by the Worker and the extension: 4–10 words, at most
 * 120 characters, no path punctuation, no terminal sentence punctuation.
 */
export function hasValidGistShape(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const words = gistWordCount(trimmed);
  return (
    words >= GIST_MIN_WORDS &&
    words <= GIST_MAX_WORDS &&
    [...trimmed].length <= GIST_MAX_CHARS &&
    !GIST_UNSAFE.test(trimmed) &&
    !/[.!?]$/.test(trimmed)
  );
}
