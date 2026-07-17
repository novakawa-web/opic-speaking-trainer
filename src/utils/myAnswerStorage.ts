export const MY_ANSWERS_STORAGE_KEY = "opic-my-answers";

export type MyAnswers = Record<string, string>;
export type MyAnswerPresence = "all" | "with" | "without";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function normalizeMyAnswerText(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeMyAnswers(value: unknown): MyAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([cardId, answer]) => {
      if (DANGEROUS_KEYS.has(cardId) || !cardId.trim() || typeof answer !== "string") {
        return [];
      }
      const normalized = normalizeMyAnswerText(answer);
      return normalized ? [[cardId, normalized]] : [];
    }),
  );
}

export function parseMyAnswers(rawValue: string | null): MyAnswers {
  if (!rawValue) return {};
  try {
    return normalizeMyAnswers(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export function readMyAnswers(): MyAnswers {
  try {
    return parseMyAnswers(localStorage.getItem(MY_ANSWERS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveMyAnswers(answers: MyAnswers) {
  const normalized = normalizeMyAnswers(answers);
  try {
    if (Object.keys(normalized).length === 0) {
      localStorage.removeItem(MY_ANSWERS_STORAGE_KEY);
    } else {
      localStorage.setItem(MY_ANSWERS_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // The in-memory answer remains available when persistent storage is unavailable.
  }
  return normalized;
}

export function setMyAnswer(
  answers: MyAnswers,
  cardId: string,
  answer: string,
) {
  const normalized = normalizeMyAnswerText(answer);
  if (!normalized || !cardId.trim() || DANGEROUS_KEYS.has(cardId)) return answers;
  return saveMyAnswers({ ...answers, [cardId]: normalized });
}

export function deleteMyAnswer(answers: MyAnswers, cardId: string) {
  const nextAnswers = { ...answers };
  delete nextAnswers[cardId];
  return saveMyAnswers(nextAnswers);
}

export function selectHasMyAnswer(answers: MyAnswers, cardId: string) {
  return Boolean(answers[cardId]?.trim());
}

export function filterCardsByMyAnswerPresence<T extends { id: string }>(
  cards: T[],
  answers: MyAnswers,
  presence: MyAnswerPresence,
) {
  if (presence === "all") return cards;
  return cards.filter((card) =>
    presence === "with"
      ? selectHasMyAnswer(answers, card.id)
      : !selectHasMyAnswer(answers, card.id),
  );
}

export function extractMyFirstLine(answer: string) {
  const normalized = answer.replace(/\r\n?/g, "\n");
  const firstNonEmptyLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstNonEmptyLine) return "";

  if (normalized.includes("\n")) return firstNonEmptyLine;
  const sentenceEnd = firstNonEmptyLine.search(/[.!?](?:[\"'”’)]?)(?:\s|$)/);
  if (sentenceEnd < 0) return firstNonEmptyLine;

  const matched = firstNonEmptyLine.slice(sentenceEnd).match(/^[.!?][\"'”’)]?/);
  return firstNonEmptyLine.slice(0, sentenceEnd + (matched?.[0].length ?? 1)).trim();
}
