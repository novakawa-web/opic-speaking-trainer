import type { DeckName, OpicCard } from "../types.ts";
import { DECK_NAMES } from "./cardStorage.ts";

export type CardEditorDraft = {
  id: string;
  deck: DeckName;
  tags: string;
  front: string;
  frontKo: string;
  firstLine: string;
  hintTitle: string;
  memoryTip: string;
  subjectTip: string;
  minimum: string;
  flow: string;
  answer: string;
  finalRep: boolean;
};

export type CardEditorValidation = {
  card: OpicCard | null;
  errors: string[];
  warnings: string[];
};

export function createEmptyCardEditorDraft(): CardEditorDraft {
  return {
    id: "__new_card_draft__",
    deck: DECK_NAMES[0],
    tags: "",
    front: "",
    frontKo: "",
    firstLine: "",
    hintTitle: "",
    memoryTip: "",
    subjectTip: "",
    minimum: "",
    flow: "",
    answer: "",
    finalRep: false,
  };
}

const FIELD_LABELS: Record<keyof CardEditorDraft, string> = {
  id: "카드 ID",
  deck: "덱",
  tags: "태그",
  front: "영어 문제",
  frontKo: "한국어 뜻",
  firstLine: "첫 문장",
  hintTitle: "힌트 제목",
  memoryTip: "기억 팁",
  subjectTip: "주어 팁",
  minimum: "최소 답변",
  flow: "답변 흐름",
  answer: "전체 답변",
  finalRep: "final_rep",
};

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeComparable(value: string) {
  return normalizeLineEndings(value).replace(/\s+/g, " ").trim();
}

function splitNonEmptyLines(value: string) {
  return normalizeLineEndings(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createCardEditorDraft(card: OpicCard): CardEditorDraft {
  return {
    id: card.id,
    deck: card.deck,
    tags: card.tags.filter((tag) => tag !== "final_rep").join(" | "),
    front: card.front,
    frontKo: card.frontKo ?? "",
    firstLine: card.firstLine,
    hintTitle: card.hint.title,
    memoryTip: card.hint.memoryTip,
    subjectTip: card.hint.subjectTip ?? "",
    minimum: card.hint.minimum,
    flow: card.hint.flow.join("\n"),
    answer: card.back.join("\n"),
    finalRep: card.tags.includes("final_rep"),
  };
}

function parseTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[|,]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag !== "final_rep"),
    ),
  ];
}

function buildAnswer(firstLine: string, answer: string) {
  const normalizedFirstLine = firstLine.trim();
  const lines = splitNonEmptyLines(answer);
  if (lines.length === 0) return null;
  if (normalizeComparable(lines[0]) === normalizeComparable(normalizedFirstLine)) {
    return lines;
  }

  const normalizedAnswer = normalizeComparable(answer);
  const normalizedFirst = normalizeComparable(normalizedFirstLine);
  if (!normalizedAnswer.startsWith(normalizedFirst)) return null;
  const nextCharacter = normalizedAnswer.slice(normalizedFirst.length, normalizedFirst.length + 1);
  if (nextCharacter && !/\s/.test(nextCharacter)) return null;
  const remainder = normalizedAnswer.slice(normalizedFirst.length).trim();
  return remainder ? [normalizedFirstLine, remainder] : [normalizedFirstLine];
}

export function validateCardEditorDraft(
  draft: CardEditorDraft,
): CardEditorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const front = draft.front.trim();
  const firstLine = draft.firstLine.trim();
  if (!front) errors.push("영어 문제는 필수입니다.");
  if (!firstLine) errors.push("첫 문장은 필수입니다.");
  if (!draft.answer.trim()) errors.push("전체 답변은 필수입니다.");
  if (!DECK_NAMES.includes(draft.deck)) errors.push("지원하는 덱을 선택해 주세요.");

  const back = firstLine && draft.answer.trim()
    ? buildAnswer(firstLine, draft.answer)
    : null;
  if (firstLine && draft.answer.trim() && !back) {
    errors.push("전체 답변의 첫 문장 또는 첫 줄이 첫 문장과 일치해야 합니다.");
  }

  const tags = parseTags(draft.tags);
  if (draft.finalRep) tags.push("final_rep");
  if (tags.includes("firstline_only") && back && back.length > 1) {
    warnings.push("firstline_only 태그가 있지만 전체 답변이 여러 줄입니다.");
  }

  if (errors.length > 0 || !back) return { card: null, errors, warnings };
  return {
    card: {
      id: draft.id,
      deck: draft.deck,
      tags,
      front,
      ...(draft.frontKo.trim() ? { frontKo: draft.frontKo.trim() } : {}),
      firstLine,
      hint: {
        title: draft.hintTitle.trim(),
        memoryTip: draft.memoryTip.trim(),
        ...(draft.subjectTip.trim() ? { subjectTip: draft.subjectTip.trim() } : {}),
        minimum: draft.minimum.trim(),
        flow: splitNonEmptyLines(draft.flow),
      },
      back,
    },
    errors,
    warnings,
  };
}

export function getChangedCardFields(
  original: OpicCard,
  draft: CardEditorDraft,
) {
  return getChangedCardEditorDraftFields(createCardEditorDraft(original), draft);
}

export function getChangedCardEditorDraftFields(
  initial: CardEditorDraft,
  draft: CardEditorDraft,
) {
  return (Object.keys(initial) as Array<keyof CardEditorDraft>)
    .filter((field) => initial[field] !== draft[field])
    .map((field) => FIELD_LABELS[field]);
}
