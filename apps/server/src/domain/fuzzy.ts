import { compactName, normalizedFullName } from "./names";

export type FuzzyCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLoginAt: Date | null;
};

export type FuzzyMatch = FuzzyCandidate & {
  score: number;
  reason: "exact" | "near" | "partial";
};

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length]!;
}

export function similarity(a: string, b: string) {
  const left = compactName(a);
  const right = compactName(b);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(left, right) / longest;
}

export function findNameMatches(firstName: string, lastName: string, candidates: FuzzyCandidate[]) {
  const desired = normalizedFullName(firstName, lastName);
  const compactDesired = compactName(desired);

  return candidates
    .map((candidate): FuzzyMatch | null => {
      const candidateName = normalizedFullName(candidate.firstName, candidate.lastName);
      const compactCandidate = compactName(candidateName);

      if (compactCandidate === compactDesired) {
        return { ...candidate, score: 100, reason: "exact" };
      }

      const score = Math.round(similarity(desired, candidateName) * 100);
      if (score >= 86) {
        return { ...candidate, score, reason: "near" };
      }

      if (compactCandidate.startsWith(compactDesired) && compactDesired.length >= 5) {
        return { ...candidate, score: Math.max(score, 82), reason: "partial" };
      }

      return null;
    })
    .filter((match): match is FuzzyMatch => match !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function isConfidentAutocomplete(query: string, candidate: FuzzyCandidate) {
  const normalizedQuery = compactName(query);
  if (normalizedQuery.length < 4) return false;
  const candidateName = compactName(`${candidate.firstName} ${candidate.lastName}`);
  return candidateName.startsWith(normalizedQuery) && normalizedQuery.length >= Math.min(8, candidateName.length);
}
