import type { AnswerLearningAnswerSource } from "../types.ts";
import type { StorageLike } from "./storageTransaction.ts";

export const ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY =
  "opic-answer-learning-sentence-checks";
export const ANSWER_LEARNING_SENTENCE_CHECKS_VERSION = 1;

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SENTENCE_CHECK_ID_PATTERN = /^v1-\d+-[0-9a-f]{8}-\d+$/;

export type AnswerLearningSentenceCheckSources = Partial<
  Record<AnswerLearningAnswerSource, string[]>
>;

export type AnswerLearningSentenceChecks = Record<
  string,
  AnswerLearningSentenceCheckSources
>;

type StoredAnswerLearningSentenceChecks = {
  version: typeof ANSWER_LEARNING_SENTENCE_CHECKS_VERSION;
  cards: AnswerLearningSentenceChecks;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeCardId(cardId: string) {
  return cardId.trim().length > 0 && !DANGEROUS_KEYS.has(cardId);
}

function isSentenceCheckId(value: unknown): value is string {
  return typeof value === "string" && SENTENCE_CHECK_ID_PATTERN.test(value);
}

function normalizeSentenceCheckIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isSentenceCheckId))];
}

export function normalizeAnswerLearningSentenceChecks(
  value: unknown,
): AnswerLearningSentenceChecks {
  if (!isRecord(value)) return {};
  const normalized: AnswerLearningSentenceChecks = {};

  Object.entries(value).forEach(([cardId, candidate]) => {
    if (!isSafeCardId(cardId) || !isRecord(candidate)) return;
    const sources: AnswerLearningSentenceCheckSources = {};
    const modelChecks = normalizeSentenceCheckIds(candidate.default);
    const myAnswerChecks = normalizeSentenceCheckIds(candidate["my-answer"]);
    if (modelChecks.length > 0) sources.default = modelChecks;
    if (myAnswerChecks.length > 0) sources["my-answer"] = myAnswerChecks;
    if (Object.keys(sources).length > 0) normalized[cardId] = sources;
  });

  return normalized;
}

export function parseAnswerLearningSentenceChecks(
  raw: string | null,
): AnswerLearningSentenceChecks {
  if (!raw) return {};
  try {
    const stored = JSON.parse(raw) as unknown;
    if (
      !isRecord(stored) ||
      stored.version !== ANSWER_LEARNING_SENTENCE_CHECKS_VERSION
    ) {
      return {};
    }
    return normalizeAnswerLearningSentenceChecks(stored.cards);
  } catch {
    return {};
  }
}

export function readAnswerLearningSentenceChecks(
  storage: Pick<StorageLike, "getItem"> = localStorage,
): AnswerLearningSentenceChecks {
  try {
    return parseAnswerLearningSentenceChecks(
      storage.getItem(ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY),
    );
  } catch {
    return {};
  }
}

export function serializeAnswerLearningSentenceChecks(
  checks: AnswerLearningSentenceChecks,
): string | null {
  const cards = normalizeAnswerLearningSentenceChecks(checks);
  if (Object.keys(cards).length === 0) return null;
  const stored: StoredAnswerLearningSentenceChecks = {
    version: ANSWER_LEARNING_SENTENCE_CHECKS_VERSION,
    cards,
  };
  return JSON.stringify(stored);
}

export function saveAnswerLearningSentenceChecks(
  checks: AnswerLearningSentenceChecks,
  storage: Pick<StorageLike, "setItem" | "removeItem"> = localStorage,
) {
  const raw = serializeAnswerLearningSentenceChecks(checks);
  if (raw === null) {
    storage.removeItem(ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY);
  } else {
    storage.setItem(ANSWER_LEARNING_SENTENCE_CHECKS_STORAGE_KEY, raw);
  }
}

function hashSentence(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeSentenceForCheck(sentence: string) {
  return sentence.trim().replace(/\s+/g, " ");
}

export function createAnswerLearningSentenceCheckIds(
  sentences: readonly string[],
): string[] {
  const occurrences = new Map<string, number>();
  return sentences.map((sentence) => {
    const normalized = normalizeSentenceForCheck(sentence);
    const occurrence = (occurrences.get(normalized) ?? 0) + 1;
    occurrences.set(normalized, occurrence);
    return `v1-${normalized.length}-${hashSentence(normalized)}-${occurrence}`;
  });
}

export function getAnswerLearningSentenceCheckIds(
  checks: AnswerLearningSentenceChecks,
  cardId: string,
  source: AnswerLearningAnswerSource,
): string[] {
  return checks[cardId]?.[source] ?? [];
}

export function toggleAnswerLearningSentenceCheck(
  checks: AnswerLearningSentenceChecks,
  cardId: string,
  source: AnswerLearningAnswerSource,
  sentenceId: string,
  validSentenceIds: readonly string[],
): AnswerLearningSentenceChecks {
  if (!isSafeCardId(cardId) || !isSentenceCheckId(sentenceId)) return checks;
  const validIds = new Set(validSentenceIds.filter(isSentenceCheckId));
  if (!validIds.has(sentenceId)) return checks;

  const current = new Set(
    (checks[cardId]?.[source] ?? []).filter((id) => validIds.has(id)),
  );
  if (current.has(sentenceId)) current.delete(sentenceId);
  else current.add(sentenceId);

  const nextSources: AnswerLearningSentenceCheckSources = {
    ...checks[cardId],
  };
  if (current.size > 0) nextSources[source] = [...current];
  else delete nextSources[source];

  const next = { ...checks };
  if (Object.keys(nextSources).length > 0) next[cardId] = nextSources;
  else delete next[cardId];
  return next;
}

export function removeCardFromAnswerLearningSentenceChecks(
  checks: AnswerLearningSentenceChecks,
  cardId: string,
): AnswerLearningSentenceChecks {
  const next = { ...checks };
  delete next[cardId];
  return next;
}

export function countAnswerLearningSentenceChecksForCard(
  checks: AnswerLearningSentenceChecks,
  cardId: string,
) {
  const sources = checks[cardId];
  if (!sources) return 0;
  return (sources.default?.length ?? 0) + (sources["my-answer"]?.length ?? 0);
}
