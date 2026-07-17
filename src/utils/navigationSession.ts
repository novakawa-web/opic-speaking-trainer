import type { DeckName, OpicCard } from "../types.ts";
import {
  isStudyCardScope,
  isStudyOrder,
  readStudyCardScope,
  readStudyOrder,
  type StudyCardScope,
  type StudyOrder,
} from "./studyPreferences.ts";

export const NAVIGATION_SESSION_STORAGE_KEY = "opic-navigation-session";

export type NavigationView = "home" | "detail" | "drill";
export type DrillSource = "list" | "detail";

export type NavigationSession = {
  currentView: NavigationView;
  selectedCardId: string | null;
  drillSource: DrillSource;
  drillCardIds: string[];
  filters: {
    selectedDeck: DeckName | "all";
    selectedTag: string;
    finalOnly: boolean;
    hardOnly: boolean;
    cardScope: StudyCardScope;
    studyOrder: StudyOrder;
  };
};

export const DEFAULT_NAVIGATION_SESSION: NavigationSession = {
  currentView: "home",
  selectedCardId: null,
  drillSource: "detail",
  drillCardIds: [],
  filters: {
    selectedDeck: "all",
    selectedTag: "all",
    finalOnly: false,
    hardOnly: false,
    cardScope: "all",
    studyOrder: "default",
  },
};

function createDefaultNavigationSession(): NavigationSession {
  return {
    ...DEFAULT_NAVIGATION_SESSION,
    filters: {
      ...DEFAULT_NAVIGATION_SESSION.filters,
      cardScope: readStudyCardScope(),
      studyOrder: readStudyOrder(),
    },
  };
}

const validViews = new Set<NavigationView>(["home", "detail", "drill"]);
const validSources = new Set<DrillSource>(["list", "detail"]);

export function readNavigationSession(): NavigationSession {
  try {
    const raw = sessionStorage.getItem(NAVIGATION_SESSION_STORAGE_KEY);
    if (!raw) return createDefaultNavigationSession();

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const filters =
      parsed.filters && typeof parsed.filters === "object"
        ? (parsed.filters as Record<string, unknown>)
        : {};
    const currentView = validViews.has(parsed.currentView as NavigationView)
      ? (parsed.currentView as NavigationView)
      : "home";
    const drillSource = validSources.has(parsed.drillSource as DrillSource)
      ? (parsed.drillSource as DrillSource)
      : "detail";

    return {
      currentView,
      selectedCardId:
        typeof parsed.selectedCardId === "string"
          ? parsed.selectedCardId
          : null,
      drillSource,
      drillCardIds: Array.isArray(parsed.drillCardIds)
        ? parsed.drillCardIds.filter(
            (cardId): cardId is string => typeof cardId === "string",
          )
        : [],
      filters: {
        selectedDeck:
          typeof filters.selectedDeck === "string"
            ? (filters.selectedDeck as DeckName | "all")
            : "all",
        selectedTag:
          typeof filters.selectedTag === "string" ? filters.selectedTag : "all",
        finalOnly:
          typeof filters.finalOnly === "boolean" ? filters.finalOnly : false,
        hardOnly:
          typeof filters.hardOnly === "boolean" ? filters.hardOnly : false,
        cardScope: isStudyCardScope(filters.cardScope)
          ? filters.cardScope
          : readStudyCardScope(),
        studyOrder: isStudyOrder(filters.studyOrder)
          ? filters.studyOrder
          : readStudyOrder(),
      },
    };
  } catch {
    return createDefaultNavigationSession();
  }
}

export function saveNavigationSession(session: NavigationSession) {
  try {
    sessionStorage.setItem(
      NAVIGATION_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
  } catch {
    // A discarded tab can still continue in memory if sessionStorage is unavailable.
  }
}

export function resolveNavigationSession(
  session: NavigationSession,
  availableCards: OpicCard[],
): NavigationSession {
  const cardExists = availableCards.some(
    (card) => card.id === session.selectedCardId,
  );
  const selectedDeck =
    session.filters.selectedDeck === "all" ||
    availableCards.some((card) => card.deck === session.filters.selectedDeck)
      ? session.filters.selectedDeck
      : "all";
  const selectedTag =
    session.filters.selectedTag === "all" ||
    availableCards.some((card) => card.tags.includes(session.filters.selectedTag))
      ? session.filters.selectedTag
      : "all";
  const availableIds = new Set(availableCards.map((card) => card.id));
  const drillCardIds = session.drillCardIds.filter(
    (cardId, index, allIds) =>
      availableIds.has(cardId) && allIds.indexOf(cardId) === index,
  );

  return {
    ...session,
    currentView:
      session.currentView === "home" || cardExists
        ? session.currentView
        : "home",
    selectedCardId: cardExists ? session.selectedCardId : null,
    drillCardIds,
    filters: { ...session.filters, selectedDeck, selectedTag },
  };
}
