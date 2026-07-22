import { CARD_MEMO_MAX_LENGTH } from "./cardMemoStorage.ts";
import {
  isRepeatCount,
  isRepeatMode,
  isRestLevel,
  type ShadowingPlaybackSettings,
} from "./shadowingSettings.ts";

export const CARD_DETAIL_UI_SESSION_KEY = "opic-card-detail-ui-session";
export const SHADOWING_PLAYER_SESSION_KEY = "opic-shadowing-player-session";
export const MY_ANSWER_DRAFT_MAX_LENGTH = 20_000;

const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);

export type AnswerTabSession = "model" | "mine";
export type MemoEditorSession = {
  mode: "new" | "edit";
  memoId: string | null;
  draft: string;
};

export type CardDetailUiSession = {
  cardId: string;
  showHint: boolean;
  showAnswer: boolean;
  answerTab: AnswerTabSession;
  myAnswerEditing: boolean;
  myAnswerDraft: string;
  memoExpanded: boolean;
  memoEditor: MemoEditorSession | null;
};

type ShadowingPlayerSessionBase = {
  active: true;
  currentIndex: number;
  status: "idle" | "paused" | "completed";
  questionExpanded: boolean;
  showFrontKo: boolean;
  sourceFingerprint?: string;
  completedRepeats?: number;
  repeatMode?: ShadowingPlaybackSettings["repeatMode"];
  repeatCount?: ShadowingPlaybackSettings["repeatCount"];
  restLevel?: ShadowingPlaybackSettings["restLevel"];
};

export type ShadowingPlayerSession = ShadowingPlayerSessionBase &
  (
    | {
        sourceType: "modelAnswer" | "myAnswer";
        cardId: string;
        savedPassageId?: never;
      }
    | {
        sourceType: "savedPassage";
        savedPassageId: string;
        cardId?: never;
      }
  );

export type RestorableShadowingSessionContext = {
  sourceType: "modelAnswer" | "myAnswer" | "savedPassage";
  cardId?: string;
  savedPassageId?: string;
  sourceFingerprint: string;
  sentenceCount: number;
  playbackSettings: ShadowingPlaybackSettings;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !blockedKeys.has(value);
}

export function defaultCardDetailUiSession(
  cardId: string,
  hasMyAnswer: boolean,
): CardDetailUiSession {
  return {
    cardId,
    showHint: false,
    showAnswer: false,
    answerTab: hasMyAnswer ? "mine" : "model",
    myAnswerEditing: false,
    myAnswerDraft: "",
    memoExpanded: false,
    memoEditor: null,
  };
}

function normalizeMemoEditor(value: unknown): MemoEditorSession | null {
  if (!isRecord(value) || (value.mode !== "new" && value.mode !== "edit")) {
    return null;
  }
  const draft = typeof value.draft === "string" ? value.draft : "";
  if (draft.length > CARD_MEMO_MAX_LENGTH) return null;
  const memoId = value.mode === "edit" && isSafeId(value.memoId) ? value.memoId : null;
  if (value.mode === "edit" && !memoId) return null;
  return { mode: value.mode, memoId, draft };
}

export function parseCardDetailUiSession(
  raw: string | null,
  cardId: string,
  hasMyAnswer: boolean,
): CardDetailUiSession {
  const fallback = defaultCardDetailUiSession(cardId, hasMyAnswer);
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || value.cardId !== cardId || !isSafeId(value.cardId)) {
      return fallback;
    }
    const draft = typeof value.myAnswerDraft === "string" ? value.myAnswerDraft : "";
    const myAnswerEditing =
      value.myAnswerEditing === true && draft.length <= MY_ANSWER_DRAFT_MAX_LENGTH;
    const answerTab =
      value.answerTab === "mine" && (hasMyAnswer || myAnswerEditing)
        ? "mine"
        : "model";
    return {
      cardId,
      showHint: value.showHint === true,
      showAnswer: value.showAnswer === true,
      answerTab,
      myAnswerEditing,
      myAnswerDraft: draft.length <= MY_ANSWER_DRAFT_MAX_LENGTH ? draft : "",
      memoExpanded: value.memoExpanded === true,
      memoEditor: normalizeMemoEditor(value.memoEditor),
    };
  } catch {
    return fallback;
  }
}

export function readCardDetailUiSession(cardId: string, hasMyAnswer: boolean) {
  try {
    return parseCardDetailUiSession(
      sessionStorage.getItem(CARD_DETAIL_UI_SESSION_KEY),
      cardId,
      hasMyAnswer,
    );
  } catch {
    return defaultCardDetailUiSession(cardId, hasMyAnswer);
  }
}

export function saveCardDetailUiSession(session: CardDetailUiSession) {
  if (!isSafeId(session.cardId)) return;
  try {
    sessionStorage.setItem(CARD_DETAIL_UI_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The current in-memory editor can continue when session storage is unavailable.
  }
}

export function updateCardDetailUiSession(
  cardId: string,
  hasMyAnswer: boolean,
  updates: Partial<Omit<CardDetailUiSession, "cardId">>,
) {
  const current = readCardDetailUiSession(cardId, hasMyAnswer);
  saveCardDetailUiSession({ ...current, ...updates, cardId });
}

export function clearCardDetailUiSession() {
  try {
    sessionStorage.removeItem(CARD_DETAIL_UI_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}

export function parseShadowingPlayerSession(raw: string | null) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      !isRecord(value) ||
      value.active !== true ||
      (value.sourceType !== "modelAnswer" &&
        value.sourceType !== "myAnswer" &&
        value.sourceType !== "savedPassage") ||
      typeof value.currentIndex !== "number" ||
      !Number.isInteger(value.currentIndex) ||
      value.currentIndex < 0 ||
      value.currentIndex > 10_000
    ) {
      return null;
    }
    const sourceIdentity =
      value.sourceType === "savedPassage"
        ? isSafeId(value.savedPassageId)
          ? { sourceType: "savedPassage" as const, savedPassageId: value.savedPassageId }
          : null
        : isSafeId(value.cardId)
          ? {
              sourceType: value.sourceType as "modelAnswer" | "myAnswer",
              cardId: value.cardId,
            }
          : null;
    if (!sourceIdentity) return null;
    const hasProgressMetadata =
      value.sourceFingerprint !== undefined ||
      value.completedRepeats !== undefined ||
      value.repeatMode !== undefined ||
      value.repeatCount !== undefined ||
      value.restLevel !== undefined;
    const progressMetadata = hasProgressMetadata
      ? typeof value.sourceFingerprint === "string" &&
        /^v1-\d+-[0-9a-f]{8}$/.test(value.sourceFingerprint) &&
        Number.isInteger(value.completedRepeats) &&
        (value.completedRepeats as number) >= 0 &&
        (value.completedRepeats as number) <= 1_000_000 &&
        isRepeatMode(value.repeatMode) &&
        isRepeatCount(value.repeatCount) &&
        isRestLevel(value.restLevel)
        ? {
            sourceFingerprint: value.sourceFingerprint,
            completedRepeats: value.completedRepeats as number,
            repeatMode: value.repeatMode,
            repeatCount: value.repeatCount,
            restLevel: value.restLevel,
          }
        : null
      : {};
    if (progressMetadata === null) return null;
    return {
      active: true,
      ...sourceIdentity,
      ...progressMetadata,
      currentIndex: value.currentIndex,
      status:
        value.status === "idle" ||
        value.status === "paused" ||
        value.status === "completed"
          ? value.status
          : "paused",
      questionExpanded: value.questionExpanded === true,
      showFrontKo: value.showFrontKo === true,
    } satisfies ShadowingPlayerSession;
  } catch {
    return null;
  }
}

export function resolveRestorableShadowingPlayerSession(
  session: ShadowingPlayerSession | null,
  context: RestorableShadowingSessionContext,
) {
  if (
    !session ||
    session.status !== "paused" ||
    session.sourceFingerprint !== context.sourceFingerprint ||
    session.currentIndex >= context.sentenceCount ||
    context.sentenceCount <= 0 ||
    session.completedRepeats === undefined ||
    session.repeatMode !== context.playbackSettings.repeatMode ||
    session.repeatCount !== context.playbackSettings.repeatCount ||
    session.restLevel !== context.playbackSettings.restLevel
  ) {
    return null;
  }
  const identityMatches = context.sourceType === "savedPassage"
    ? session.sourceType === "savedPassage" &&
      session.savedPassageId === context.savedPassageId
    : session.sourceType === context.sourceType &&
      session.cardId === context.cardId;
  if (!identityMatches) return null;
  if (
    session.repeatCount !== "infinite" &&
    session.completedRepeats >= session.repeatCount
  ) {
    return null;
  }
  return session;
}

export function readShadowingPlayerSession() {
  try {
    return parseShadowingPlayerSession(
      sessionStorage.getItem(SHADOWING_PLAYER_SESSION_KEY),
    );
  } catch {
    return null;
  }
}

export function saveShadowingPlayerSession(session: ShadowingPlayerSession) {
  if (
    (session.sourceType === "savedPassage" &&
      !isSafeId(session.savedPassageId)) ||
    (session.sourceType !== "savedPassage" && !isSafeId(session.cardId))
  ) {
    return;
  }
  try {
    sessionStorage.setItem(SHADOWING_PLAYER_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The active player still works in memory.
  }
}

export function clearShadowingPlayerSession() {
  try {
    sessionStorage.removeItem(SHADOWING_PLAYER_SESSION_KEY);
  } catch {
    // Ignore unavailable session storage.
  }
}
