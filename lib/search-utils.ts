/**
 * Search utility helpers
 *
 * Provides shared helpers for tokenizing search terms and matching them against
 * multiple text fields. Tokens are derived by splitting on whitespace and
 * transformed to lowercase for case-insensitive comparisons.
 */
export const tokenizeSearchTerm = (term: string): string[] => {
  return term
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0)
}

export const matchesSearchTokens = (
  tokens: string[],
  haystacks: Array<string | undefined | null>,
): boolean => {
  if (tokens.length === 0) return true

  const normalizedHaystacks = haystacks
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase())

  if (normalizedHaystacks.length === 0) return false

  return tokens.every((token) => normalizedHaystacks.some((value) => value.includes(token)))
}

