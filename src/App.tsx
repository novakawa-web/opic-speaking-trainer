import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { BackupManager } from "./components/BackupManager";
import { AnswerLearning } from "./components/AnswerLearning";
import {
  AnswerLearningSetup,
} from "./components/AnswerLearningSetup";
import {
  filterAnswerLearningCards,
  orderAnswerLearningCards,
} from "./utils/answerLearningSelectors";
import { CardLibrary } from "./components/CardLibrary";
import {
  PersonalMemoLibrary,
  PersonalMemoSummary,
} from "./components/PersonalMemoManager";
import { CardDataManager } from "./components/CardDataManager";
import { CardDetail } from "./components/CardDetail";
import { DirectTextPractice } from "./components/DirectTextPractice";
import { FirstLineDrill } from "./components/FirstLineDrill";
import { FirstLineSetup } from "./components/FirstLineSetup";
import { FirstLineMockResult } from "./components/FirstLineMockResult";
import { HomeCardDashboard } from "./components/HomeCardDashboard";
import { HomeManagement } from "./components/HomeManagement";
import { HomeQuickStart } from "./components/HomeQuickStart";
import { ShadowingPlayer } from "./components/ShadowingPlayer";
import { StudyDaySettings } from "./components/StudyDaySettings";
import { TodayStats } from "./components/TodayStats";
import { cards as defaultCards } from "./data/cards";
import type {
  DeckName,
  AnswerLearningStatus,
  AnswerLearningUndoEntry,
  FirstLineResult,
  FirstLineStatusMap,
  OpicCard,
  StatusUndoEntry,
} from "./types";
import {
  calculateAnswerLearningAttemptCounts,
  calculateAnswerLearningDailyStats,
  readAnswerLearningAttempts,
  readAnswerLearningStatuses,
  recordAnswerLearningAttempt,
  removeAnswerLearningAttempt,
  saveAnswerLearningStatuses,
} from "./utils/answerLearningStorage";
import {
  clearAnswerLearningSession,
  readAnswerLearningSession,
  saveAnswerLearningSession,
  shuffleAnswerLearningIds,
  type AnswerLearningSession,
} from "./utils/answerLearningSession";
import {
  calculateAttemptCounts,
  calculateDailyStats,
  readStudyAttempts,
  recordStudyAttempt,
  removeStudyAttempt,
} from "./utils/studyStats";
import {
  readStudyDayStartTime,
  saveStudyDayStartTime,
} from "./utils/studyDay";
import {
  readNavigationSession,
  resolveNavigationSession,
  saveNavigationSession,
} from "./utils/navigationSession";
import { consumePostRestoreNavigation } from "./utils/postRestoreNavigation";
import {
  saveStudyCardScope,
  saveStudyOrder,
  type StudyCardScope,
  type StudyOrder,
} from "./utils/studyPreferences";
import { applyTheme, readInitialTheme, saveTheme } from "./utils/themeStorage";
import { readActiveCards } from "./utils/cardStorage";
import { readStoredStatuses, saveStatuses } from "./utils/statusStorage";
import {
  matchesAnswerContentFilter,
  type AnswerContentFilter,
} from "./utils/cardContent";
import {
  clearFirstLineMockSession,
  createFirstLineMockSession,
  readFirstLineMockSession,
  saveFirstLineMockSession,
  type FirstLineMode,
  type FirstLineMockSession,
  type MockQuestionCount,
} from "./utils/firstLineMockSession";
import {
  deleteMyAnswer,
  readMyAnswers,
  setMyAnswer,
} from "./utils/myAnswerStorage";
import {
  createCardMemo,
  deleteCardMemo,
  readCardMemos,
  restoreCardMemo,
  toggleCardMemoPinned,
  updateCardMemo,
  type CardMemo,
} from "./utils/cardMemoStorage";
import {
  createModelAnswerSource,
  createMyAnswerSource,
  createSavedPassageSource,
  type ShadowingSource,
} from "./utils/shadowingPlayer";
import {
  addSavedPassage,
  deleteSavedPassage,
  readSavedPassageDataset,
  restoreSavedPassage,
  updateSavedPassage,
  type SavedPassage,
} from "./utils/savedPassageStorage";
import {
  clearCardDetailUiSession,
  clearShadowingPlayerSession,
  readShadowingPlayerSession,
} from "./utils/uiSessionStorage";
import {
  clearPersonalMemoEditorSession,
  createEmptyPersonalMemoEditorSession,
  createPersonalMemo,
  deletePersonalMemo,
  readPersonalMemoEditorSession,
  readPersonalMemoDataset,
  readPersonalMemoLibrarySession,
  restorePersonalMemo,
  savePersonalMemoEditorSession,
  savePersonalMemoLibrarySession,
  togglePersonalMemoPinned,
  updatePersonalMemo,
  type PersonalMemo,
} from "./utils/personalMemoStorage";

type View =
  | "list"
  | "library"
  | "detail"
  | "drillSetup"
  | "drill"
  | "answerSetup"
  | "answerLearning"
  | "shadowing"
  | "personalMemos";
type CardNavigationSource = "manual" | "auto";

function shuffleCardIds(sourceCards: OpicCard[]) {
  const ids = sourceCards.map((card) => card.id);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  return ids;
}

const statusLabels: Record<FirstLineResult, string> = {
  success: "성공",
  again: "연습 필요",
  hard: "어려움",
};

function readInitialNavigationState(availableCards: OpicCard[]) {
  const stored = resolveNavigationSession(
    readNavigationSession(),
    availableCards,
  );

  const playerSession = readShadowingPlayerSession();
  const playerCard = playerSession?.sourceType !== "savedPassage"
    ? availableCards.find((card) => card.id === playerSession?.cardId) ?? null
    : null;
  const playerPassage = playerSession?.sourceType === "savedPassage"
    ? readSavedPassageDataset().passages.find(
        (passage) => passage.id === playerSession.savedPassageId,
      ) ?? null
    : null;
  const storedMyAnswers = playerCard ? readMyAnswers() : {};
  const answerSession = readAnswerLearningSession(
    availableCards.map((card) => card.id),
  );
  const restoredShadowingSource = playerPassage
    ? createSavedPassageSource(playerPassage)
    : playerCard
      ? playerSession?.sourceType === "myAnswer" && storedMyAnswers[playerCard.id]
      ? createMyAnswerSource(playerCard, storedMyAnswers[playerCard.id])
      : createModelAnswerSource(playerCard)
      : null;

  return {
    view: restoredShadowingSource
      ? ("shadowing" as const)
      : answerSession.screen === "learning" && answerSession.cardOrder.length > 0
        ? ("answerLearning" as const)
      : stored.currentView === "home"
        ? ("list" as const)
        : stored.currentView,
    selectedCardId: restoredShadowingSource?.cardId ?? stored.selectedCardId,
    shadowingSource: restoredShadowingSource,
    shadowingReturnView: playerPassage
      ? ("direct" as const)
      : answerSession.screen === "learning" && playerCard && answerSession.cardOrder.includes(playerCard.id)
        ? ("answerLearning" as const)
        : ("detail" as const),
    answerSession,
    drillReturnView: stored.drillSource,
    detailReturnView: stored.detailSource,
    selectedDeck: stored.filters.selectedDeck,
    selectedTag: stored.filters.selectedTag,
    finalOnly: stored.filters.finalOnly,
    hardOnly: stored.filters.hardOnly,
    cardScope: stored.filters.cardScope,
    studyOrder: stored.filters.studyOrder,
    drillCardIds: stored.drillCardIds,
  };
}

function App() {
  const [postRestoreNavigation] = useState(consumePostRestoreNavigation);
  const [initialCardState] = useState(() => readActiveCards(defaultCards));
  const [cardCatalog, setCardCatalog] = useState<OpicCard[]>(
    initialCardState.cards,
  );
  const [cardStorageWarning, setCardStorageWarning] = useState(
    initialCardState.invalidStoredData,
  );
  const [initialNavigation] = useState(() =>
    readInitialNavigationState(initialCardState.cards),
  );
  const [answerSession, setAnswerSession] = useState<AnswerLearningSession>(
    initialNavigation.answerSession,
  );
  const [theme, setTheme] = useState(readInitialTheme);
  const [view, setView] = useState<View>(() =>
    initialNavigation.view === "list" && readPersonalMemoLibrarySession()
      ? "personalMemos"
      : initialNavigation.view,
  );
  const [drillReturnView, setDrillReturnView] = useState<"list" | "detail">(
    initialNavigation.drillReturnView,
  );
  const [detailReturnView, setDetailReturnView] = useState<"home" | "library">(
    initialNavigation.detailReturnView,
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    initialNavigation.selectedCardId,
  );
  const [selectedDeck, setSelectedDeck] = useState<DeckName | "all">(
    initialNavigation.selectedDeck,
  );
  const [selectedTag, setSelectedTag] = useState(initialNavigation.selectedTag);
  const [finalOnly, setFinalOnly] = useState(initialNavigation.finalOnly);
  const [hardOnly, setHardOnly] = useState(initialNavigation.hardOnly);
  const [answerContentFilter, setAnswerContentFilter] = useState<AnswerContentFilter>("all");
  const [firstLineMode, setFirstLineMode] = useState<FirstLineMode>("practice");
  const [mockQuestionCount, setMockQuestionCount] = useState<MockQuestionCount>(10);
  const [mockSession, setMockSession] = useState<FirstLineMockSession | null>(() =>
    readFirstLineMockSession(initialCardState.cards.map((card) => card.id)),
  );
  const [answerLearningStatusFilter, setAnswerLearningStatusFilter] = useState<
    "all" | "unlearned" | AnswerLearningStatus
  >("all");
  const [cardScope, setCardScope] = useState<StudyCardScope>(
    initialNavigation.cardScope,
  );
  const [studyOrder, setStudyOrder] = useState<StudyOrder>(
    initialNavigation.studyOrder,
  );
  const [drillCardIds, setDrillCardIds] = useState<string[]>(
    initialNavigation.drillCardIds,
  );
  const [statuses, setStatuses] = useState<FirstLineStatusMap>(
    readStoredStatuses,
  );
  const [myAnswers, setMyAnswers] = useState(readMyAnswers);
  const [cardMemos, setCardMemos] = useState(readCardMemos);
  const [savedPassageDataset, setSavedPassageDataset] = useState(
    readSavedPassageDataset,
  );
  const [personalMemoDataset, setPersonalMemoDataset] = useState(
    readPersonalMemoDataset,
  );
  const [memoFocus, setMemoFocus] = useState<{ cardId: string; memoId: string } | null>(null);
  const [studyAttempts, setStudyAttempts] = useState(readStudyAttempts);
  const [answerLearningStatuses, setAnswerLearningStatuses] = useState(
    readAnswerLearningStatuses,
  );
  const [answerLearningAttempts, setAnswerLearningAttempts] = useState(
    readAnswerLearningAttempts,
  );
  const [answerLearningUndo, setAnswerLearningUndo] =
    useState<AnswerLearningUndoEntry | null>(null);
  const [answerLearningFeedback, setAnswerLearningFeedback] = useState<string | null>(null);
  const [answerLearningReturnView, setAnswerLearningReturnView] = useState<
    "setup" | "detail"
  >("setup");
  const [studyDayStartTime, setStudyDayStartTime] = useState(
    readStudyDayStartTime,
  );
  const [lastUndo, setLastUndo] = useState<StatusUndoEntry | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [shadowingSource, setShadowingSource] = useState<ShadowingSource | null>(
    initialNavigation.shadowingSource,
  );
  const [shadowingReturnView, setShadowingReturnView] = useState<
    "detail" | "direct" | "answerLearning"
  >(
    initialNavigation.shadowingReturnView,
  );

  useEffect(() => {
    if (!postRestoreNavigation) return;
    window.requestAnimationFrame(() => {
      document.getElementById(postRestoreNavigation.target)?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });
  }, [postRestoreNavigation]);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    saveStudyDayStartTime(studyDayStartTime);
  }, [studyDayStartTime]);

  useEffect(() => {
    saveStudyCardScope(cardScope);
  }, [cardScope]);

  useEffect(() => {
    saveStudyOrder(studyOrder);
  }, [studyOrder]);

  useEffect(() => {
    saveAnswerLearningSession(answerSession);
  }, [answerSession]);

  const selectedCard =
    cardCatalog.find((card) => card.id === selectedCardId) ?? null;
  const decks = useMemo(
    () => [...new Set(cardCatalog.map((card) => card.deck))],
    [cardCatalog],
  );
  const tags = useMemo(
    () => [...new Set(cardCatalog.flatMap((card) => card.tags))].sort(),
    [cardCatalog],
  );
  const todayStats = useMemo(
    () => calculateDailyStats(studyAttempts, studyDayStartTime),
    [studyAttempts, studyDayStartTime],
  );
  const attemptCounts = useMemo(
    () => calculateAttemptCounts(studyAttempts),
    [studyAttempts],
  );
  const answerLearningAttemptCounts = useMemo(
    () => calculateAnswerLearningAttemptCounts(answerLearningAttempts),
    [answerLearningAttempts],
  );
  const answerLearningTodayStats = useMemo(
    () => calculateAnswerLearningDailyStats(answerLearningAttempts, studyDayStartTime),
    [answerLearningAttempts, studyDayStartTime],
  );

  const filteredCards = useMemo(
    () =>
      cardCatalog.filter((card) => {
        const matchesDeck = selectedDeck === "all" || card.deck === selectedDeck;
        const matchesTag = selectedTag === "all" || card.tags.includes(selectedTag);
        const matchesFinal = !finalOnly || card.tags.includes("final_rep");
        const matchesHard = !hardOnly || statuses[card.id] === "hard";
        const matchesScope = cardScope === "all" || statuses[card.id] == null;
        const matchesContent = matchesAnswerContentFilter(card, answerContentFilter);
        const answerStatus = answerLearningStatuses[card.id];
        const matchesAnswerLearning =
          answerLearningStatusFilter === "all" ||
          (answerLearningStatusFilter === "unlearned"
            ? !answerStatus
            : answerStatus === answerLearningStatusFilter);

        return (
          matchesDeck &&
          matchesTag &&
          matchesFinal &&
          matchesHard &&
          matchesScope &&
          matchesContent &&
          matchesAnswerLearning
        );
      }),
    [
      cardCatalog,
      answerLearningStatuses,
      answerLearningStatusFilter,
      answerContentFilter,
      cardScope,
      finalOnly,
      hardOnly,
      selectedDeck,
      selectedTag,
      statuses,
    ],
  );
  const orderedFilteredCards = useMemo(() => {
    if (studyOrder !== "least-practiced") return filteredCards;

    return filteredCards
      .map((card, originalIndex) => ({ card, originalIndex }))
      .sort(
        (left, right) =>
          (attemptCounts[left.card.id] ?? 0) -
            (attemptCounts[right.card.id] ?? 0) ||
          left.originalIndex - right.originalIndex,
      )
      .map(({ card }) => card);
  }, [attemptCounts, filteredCards, studyOrder]);
  const filterSignature = JSON.stringify([
    selectedDeck,
    selectedTag,
    finalOnly,
    hardOnly,
    cardScope,
    studyOrder,
    answerLearningStatusFilter,
    answerContentFilter,
  ]);
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedDeck !== "all") parts.push(selectedDeck);
    if (selectedTag !== "all") parts.push(`#${selectedTag}`);
    if (finalOnly) parts.push("final_rep");
    if (hardOnly) parts.push("첫 문장 어려움");
    if (cardScope === "new") parts.push("새 카드");
    if (answerContentFilter === "first-line-only") parts.push("첫 문장 전용");
    if (answerContentFilter === "full-answer") parts.push("전체 답변 있음");
    if (studyOrder === "random") parts.push("랜덤 순서");
    if (studyOrder === "least-practiced") parts.push("연습 횟수 적은 순");
    return parts.length > 0 ? parts.join(" · ") : "필터 없음 · 기본 순서";
  }, [answerContentFilter, cardScope, finalOnly, hardOnly, selectedDeck, selectedTag, studyOrder]);
  const drillCards = useMemo(() => {
    const byId = new Map(cardCatalog.map((card) => [card.id, card]));
    return drillCardIds.flatMap((cardId) => {
      const card = byId.get(cardId);
      return card ? [card] : [];
    });
  }, [cardCatalog, drillCardIds]);
  const answerLearningCards = useMemo(() => {
    const byId = new Map(cardCatalog.map((card) => [card.id, card]));
    return answerSession.cardOrder.flatMap((cardId) => {
      const card = byId.get(cardId);
      return card ? [card] : [];
    });
  }, [answerSession.cardOrder, cardCatalog]);
  const detailCards =
    drillReturnView === "detail" &&
    selectedCardId !== null &&
    drillCardIds.includes(selectedCardId)
      ? drillCards
      : orderedFilteredCards;
  const activeCards =
    view === "answerLearning" ||
    (view === "shadowing" && shadowingReturnView === "answerLearning")
      ? answerLearningCards
      : view === "drill"
        ? drillCards
        : detailCards;
  const selectedFilteredIndex = activeCards.findIndex(
    (card) => card.id === selectedCardId,
  );
  const currentPosition =
    selectedFilteredIndex >= 0 ? selectedFilteredIndex + 1 : 0;
  const canGoPrevious = selectedFilteredIndex > 0;
  const canGoNext =
    selectedFilteredIndex >= 0 && selectedFilteredIndex < activeCards.length - 1;

  function createDrillCardIds(sourceCards: OpicCard[]) {
    return studyOrder === "random"
      ? shuffleCardIds(sourceCards)
      : sourceCards.map((card) => card.id);
  }

  useEffect(() => {
    if (view !== "drill" || drillCards.length > 0) return;

    const recoveredIds = createDrillCardIds(orderedFilteredCards);
    if (recoveredIds.length === 0) {
      setSelectedCardId(null);
      setView("list");
      return;
    }

    setDrillCardIds(recoveredIds);
    if (!selectedCardId || !recoveredIds.includes(selectedCardId)) {
      setSelectedCardId(recoveredIds[0]);
    }
  }, [drillCards.length, orderedFilteredCards, selectedCardId, studyOrder, view]);

  useEffect(() => {
    if (
      view === "list" ||
      view === "answerSetup" ||
      !selectedCardId ||
      selectedFilteredIndex >= 0 ||
      (view === "drill" && drillCards.length === 0)
    ) {
      return;
    }

    // Invalid or filtered-out restored cards always return to a safe home state.
    setSelectedCardId(null);
    setView("list");
  }, [answerLearningCards.length, drillCards.length, selectedCardId, selectedFilteredIndex, view]);

  useEffect(() => {
    const persistedView =
      view === "shadowing"
        ? shadowingReturnView === "detail"
          ? "detail"
          : "home"
        : view === "list" ||
            view === "drillSetup" ||
            view === "personalMemos" ||
            view === "answerSetup" ||
            view === "answerLearning"
          ? "home"
          : view;
    saveNavigationSession({
      currentView: persistedView,
      selectedCardId: persistedView === "home" ? null : selectedCardId,
      drillSource: drillReturnView,
      detailSource: detailReturnView,
      drillCardIds,
      filters: {
        selectedDeck,
        selectedTag,
        finalOnly,
        hardOnly,
        cardScope,
        studyOrder,
      },
    });
  }, [
    cardScope,
    drillCardIds,
    drillReturnView,
    detailReturnView,
    finalOnly,
    hardOnly,
    selectedCardId,
    selectedDeck,
    selectedTag,
    studyOrder,
    shadowingReturnView,
    view,
  ]);

  useEffect(() => {
    if (view !== "shadowing") return;

    const handlePopState = () => {
      clearShadowingPlayerSession();
      setShadowingSource(null);
      if (
        shadowingReturnView === "answerLearning" &&
        answerSession.cardOrder.length > 0
      ) {
        const index = Math.min(answerSession.currentIndex, answerSession.cardOrder.length - 1);
        setSelectedCardId(answerSession.cardOrder[index] ?? null);
        setView("answerLearning");
      } else if (
        shadowingReturnView === "detail" &&
        selectedCardId &&
        cardCatalog.some((card) => card.id === selectedCardId)
      ) {
        setView("detail");
      } else {
        setSelectedCardId(null);
        setView("list");
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [answerSession.cardOrder, answerSession.currentIndex, cardCatalog, selectedCardId, shadowingReturnView, view]);

  useEffect(() => {
    if (view !== "library" && view !== "detail") return;

    const handlePopState = () => {
      if (view === "detail") {
        clearCardDetailUiSession();
        setLastUndo(null);
        setFeedbackMessage(null);
        setSelectedCardId(null);
        setMemoFocus(null);
        setView(detailReturnView === "library" ? "library" : "list");
      } else {
        setView("list");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [detailReturnView, view]);

  function openCard(card: OpicCard, source: "home" | "library" = "library") {
    clearCardDetailUiSession();
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds([]);
    setMemoFocus(null);
    setShadowingSource(null);
    setDetailReturnView(source);
    setSelectedCardId(card.id);
    window.history.pushState({ ...window.history.state, opicView: "detail" }, "");
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCardLibrary() {
    setSelectedCardId(null);
    window.history.pushState({ ...window.history.state, opicView: "library" }, "");
    setView("library");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeCardLibrary() {
    if (window.history.state?.opicView === "library") {
      window.history.back();
      return;
    }
    setView("list");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeCardDetail() {
    if (window.history.state?.opicView === "detail") {
      window.history.back();
      return;
    }
    clearCardDetailUiSession();
    setLastUndo(null);
    setFeedbackMessage(null);
    setSelectedCardId(null);
    setMemoFocus(null);
    setView(detailReturnView === "library" ? "library" : "list");
  }

  function startCardShadowing(source: ShadowingSource) {
    window.history.pushState({ ...window.history.state, opicShadowing: true }, "");
    setShadowingSource(source);
    setShadowingReturnView("detail");
    setView("shadowing");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function startDirectShadowing(source: ShadowingSource) {
    clearShadowingPlayerSession();
    window.history.pushState({ ...window.history.state, opicShadowing: true }, "");
    setShadowingSource(source);
    setShadowingReturnView("direct");
    setSelectedCardId(null);
    setView("shadowing");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateShadowingCard(offset: -1 | 1) {
    if (selectedFilteredIndex < 0) return;
    const nextCard = activeCards[selectedFilteredIndex + offset];
    if (!nextCard) return;
    const nextSource = myAnswers[nextCard.id]
      ? createMyAnswerSource(nextCard, myAnswers[nextCard.id])
      : createModelAnswerSource(nextCard);
    setSelectedCardId(nextCard.id);
    setShadowingSource(nextSource);
    if (shadowingReturnView === "answerLearning") {
      updateAnswerSession({
        ...answerSession,
        currentIndex: selectedFilteredIndex + offset,
        answerSources: {
          ...answerSession.answerSources,
          [nextCard.id]: myAnswers[nextCard.id] ? "my-answer" : "default",
        },
      });
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function changeShadowingSource(sourceType: "modelAnswer" | "myAnswer") {
    if (!selectedCard) return;
    if (sourceType === "myAnswer" && myAnswers[selectedCard.id]) {
      setShadowingSource(createMyAnswerSource(selectedCard, myAnswers[selectedCard.id]));
    } else {
      setShadowingSource(createModelAnswerSource(selectedCard));
    }
    if (shadowingReturnView === "answerLearning") {
      updateAnswerSession({
        ...answerSession,
        answerSources: {
          ...answerSession.answerSources,
          [selectedCard.id]: sourceType === "myAnswer" && myAnswers[selectedCard.id]
            ? "my-answer"
            : "default",
        },
      });
    }
  }

  function startFilteredDrill() {
    const nextDrillCardIds = createDrillCardIds(orderedFilteredCards);
    const firstCardId = nextDrillCardIds[0];
    if (!firstCardId) return;

    clearFirstLineMockSession();
    setMockSession(null);

    setLastUndo(null);
    setFeedbackMessage(null);
    setMemoFocus(null);
    setDrillCardIds(nextDrillCardIds);
    setSelectedCardId(firstCardId);
    setDrillReturnView("list");
    setView("drill");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openFirstLineSetup() {
    // The answer-learning status filter is not shown in this setup screen.
    setAnswerLearningStatusFilter("all");
    setSelectedCardId(null);
    setView("drillSetup");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function startFirstLineFromSetup() {
    if (firstLineMode === "practice") {
      startFilteredDrill();
      return;
    }
    const session = createFirstLineMockSession(
      orderedFilteredCards.map((card) => card.id),
      mockQuestionCount,
    );
    const firstCardId = session.cardOrder[0];
    if (!firstCardId) return;
    saveFirstLineMockSession(session);
    setMockSession(session);
    setDrillCardIds(session.cardOrder);
    setSelectedCardId(firstCardId);
    setDrillReturnView("list");
    setLastUndo(null);
    setFeedbackMessage(null);
    setView("drill");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function restartMock(sourceIds: string[], count: MockQuestionCount) {
    const valid = new Set(cardCatalog.map((card) => card.id));
    const session = createFirstLineMockSession(sourceIds.filter((id) => valid.has(id)), count);
    if (!session.cardOrder[0]) return;
    saveFirstLineMockSession(session);
    setMockSession(session);
    setDrillCardIds(session.cardOrder);
    setSelectedCardId(session.cardOrder[0]);
    setLastUndo(null);
    setFeedbackMessage(null);
    setView("drill");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateAnswerSession(next: AnswerLearningSession) {
    setAnswerSession(next);
    saveAnswerLearningSession(next);
  }

  function openAnswerLearningSetup() {
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback(null);
    updateAnswerSession({ ...answerSession, screen: "setup" });
    setSelectedCardId(null);
    setAnswerLearningReturnView("setup");
    setView("answerSetup");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function startAnswerLearning() {
    const filtered = orderAnswerLearningCards(
      filterAnswerLearningCards(
        cardCatalog,
        answerSession.filters,
        answerLearningStatuses,
        myAnswers,
      ),
      answerSession.filters.order,
      answerLearningAttemptCounts,
    );
    const selected = new Set(answerSession.selectedCardIds);
    const ids = filtered.map((card) => card.id).filter((id) => selected.has(id));
    const cardOrder =
      answerSession.filters.order === "random"
        ? shuffleAnswerLearningIds(ids)
        : ids;
    if (cardOrder.length === 0) return;
    const answerSources = { ...answerSession.answerSources };
    cardOrder.forEach((cardId) => {
      if (!answerSources[cardId] || (answerSources[cardId] === "my-answer" && !myAnswers[cardId])) {
        answerSources[cardId] = myAnswers[cardId] ? "my-answer" : "default";
      }
    });
    const nextSession: AnswerLearningSession = {
      ...answerSession,
      screen: "learning",
      cardOrder,
      currentIndex: 0,
      answerSources,
    };
    updateAnswerSession(nextSession);
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback(null);
    setSelectedCardId(cardOrder[0]);
    setView("answerLearning");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function startSingleCardAnswerLearning(card: OpicCard) {
    const nextSession: AnswerLearningSession = {
      ...answerSession,
      screen: "learning",
      selectedCardIds: [card.id],
      cardOrder: [card.id],
      currentIndex: 0,
      answerSources: {
        ...answerSession.answerSources,
        [card.id]: myAnswers[card.id] ? "my-answer" : "default",
      },
      reveals: {
        ...answerSession.reveals,
        [card.id]: { hint: false, firstLine: false, answer: false, frontKo: false },
      },
    };
    updateAnswerSession(nextSession);
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback(null);
    setSelectedCardId(card.id);
    setAnswerLearningReturnView("detail");
    setView("answerLearning");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function leaveAnswerLearning() {
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback(null);
    if (answerLearningReturnView === "detail" && selectedCard) {
      updateAnswerSession({ ...answerSession, screen: "setup" });
      setView("detail");
    } else {
      updateAnswerSession({ ...answerSession, screen: "setup" });
      setSelectedCardId(null);
      setView("answerSetup");
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeAnswerLearning() {
    clearAnswerLearningSession();
    setAnswerSession({
      ...answerSession,
      screen: "setup",
      selectedCardIds: [],
      cardOrder: [],
      currentIndex: 0,
      answerSources: {},
      reveals: {},
    });
    setSelectedCardId(null);
    setView("list");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateAnswerLearning(offset: -1 | 1) {
    const nextIndex = answerSession.currentIndex + offset;
    const nextCardId = answerSession.cardOrder[nextIndex];
    if (!nextCardId) return;
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback(null);
    const nextSession: AnswerLearningSession = {
      ...answerSession,
      currentIndex: nextIndex,
      reveals: {
        ...answerSession.reveals,
        [nextCardId]: { hint: false, firstLine: false, answer: false, frontKo: false },
      },
      answerSources: {
        ...answerSession.answerSources,
        [nextCardId]: myAnswers[nextCardId] ? "my-answer" : "default",
      },
    };
    updateAnswerSession(nextSession);
    setSelectedCardId(nextCardId);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function updateAnswerLearningStatus(status: AnswerLearningStatus) {
    if (!selectedCard) return;
    const cardId = selectedCard.id;
    const previousStatus = answerLearningStatuses[cardId] ?? null;
    const nextStatuses = { ...answerLearningStatuses, [cardId]: status };
    const answerSource =
      answerSession.answerSources[cardId] === "my-answer" && myAnswers[cardId]
        ? "my-answer"
        : "default";
    const result = recordAnswerLearningAttempt(
      answerLearningAttempts,
      cardId,
      status,
      answerSource,
      studyDayStartTime,
    );
    saveAnswerLearningStatuses(nextStatuses);
    setAnswerLearningStatuses(nextStatuses);
    setAnswerLearningAttempts(result.attemptsByDate);
    setAnswerLearningUndo({
      cardId,
      previousStatus,
      newStatus: status,
      attemptId: result.attempt.id,
      attemptDate: result.attempt.date,
      answerSource,
    });
    setAnswerLearningFeedback(`${selectedCard.hint.title}: 상태를 저장했어요.`);
  }

  function undoAnswerLearningStatus() {
    if (!answerLearningUndo) return;
    const entry = answerLearningUndo;
    const nextStatuses = { ...answerLearningStatuses };
    if (entry.previousStatus) nextStatuses[entry.cardId] = entry.previousStatus;
    else delete nextStatuses[entry.cardId];
    saveAnswerLearningStatuses(nextStatuses);
    setAnswerLearningStatuses(nextStatuses);
    setAnswerLearningAttempts((current) =>
      removeAnswerLearningAttempt(current, entry.attemptDate, entry.attemptId),
    );
    const cardIndex = answerSession.cardOrder.indexOf(entry.cardId);
    if (cardIndex >= 0) {
      updateAnswerSession({ ...answerSession, currentIndex: cardIndex });
      setSelectedCardId(entry.cardId);
    }
    setAnswerLearningUndo(null);
    setAnswerLearningFeedback("방금 선택한 답변 익히기 상태를 취소했어요.");
  }

  function resetAnswerLearningStatus() {
    if (!selectedCard || !answerLearningStatuses[selectedCard.id]) return;
    const next = { ...answerLearningStatuses };
    delete next[selectedCard.id];
    saveAnswerLearningStatuses(next);
    setAnswerLearningStatuses(next);
    setAnswerLearningFeedback("현재 상태만 초기화했어요. 이전 학습 시도 기록은 유지됩니다.");
  }

  function startAnswerLearningShadowing(source: ShadowingSource) {
    window.history.pushState({ ...window.history.state, opicShadowing: true }, "");
    setShadowingSource(source);
    setShadowingReturnView("answerLearning");
    setView("shadowing");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigateCard(
    offset: -1 | 1,
    source: CardNavigationSource = "manual",
  ) {
    if (selectedFilteredIndex < 0) return;

    const nextCard = activeCards[selectedFilteredIndex + offset];
    if (!nextCard) return;

    if (source === "manual") {
      setLastUndo(null);
      setFeedbackMessage(null);
    }
    setMemoFocus(null);
    setSelectedCardId(nextCard.id);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function updateStatus(status: FirstLineResult) {
    if (!selectedCard) return;

    const cardId = selectedCard.id;
    const previousStatus = statuses[cardId] ?? null;
    const nextStatuses = { ...statuses, [cardId]: status };
    const { attempt, attemptsByDate } = recordStudyAttempt(
      cardId,
      status,
      studyDayStartTime,
    );

    saveStatuses(nextStatuses);
    setStatuses(nextStatuses);
    setStudyAttempts(attemptsByDate);
    setLastUndo({
      cardId,
      previousStatus,
      newStatus: status,
      attemptId: attempt.id,
      attemptDate: attempt.date,
      attemptTimestamp: attempt.timestamp,
    });
    setFeedbackMessage(null);
    if (mockSession?.screen === "exam" && mockSession.cardOrder.includes(cardId)) {
      const answers = { ...mockSession.answers, [cardId]: status };
      const nextMock: FirstLineMockSession = {
        ...mockSession,
        answers,
        screen: mockSession.cardOrder.every((id) => Boolean(answers[id]))
          ? "complete"
          : "exam",
      };
      saveFirstLineMockSession(nextMock);
      setMockSession(nextMock);
    }
  }

  function undoLastStatus() {
    const lastEntry = lastUndo;
    if (!lastEntry) return;

    const nextStatuses = { ...statuses };
    if (lastEntry.previousStatus === null) {
      delete nextStatuses[lastEntry.cardId];
    } else {
      nextStatuses[lastEntry.cardId] = lastEntry.previousStatus;
    }

    saveStatuses(nextStatuses);
    setStatuses(nextStatuses);
    setStudyAttempts((current) =>
      removeStudyAttempt(
        current,
        lastEntry.attemptDate,
        lastEntry.attemptId,
      ),
    );
    setLastUndo(null);

    if (mockSession?.answers[lastEntry.cardId]) {
      const answers = { ...mockSession.answers };
      delete answers[lastEntry.cardId];
      const nextMock = { ...mockSession, answers, screen: "exam" as const };
      saveFirstLineMockSession(nextMock);
      setMockSession(nextMock);
    }

    if (
      view === "drill" &&
      selectedCardId !== lastEntry.cardId &&
      drillCardIds.includes(lastEntry.cardId)
    ) {
      setSelectedCardId(lastEntry.cardId);
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    const undoneCard = cardCatalog.find((card) => card.id === lastEntry.cardId);
    const restoredLabel = lastEntry.previousStatus
      ? `${statusLabels[lastEntry.previousStatus]} 상태`
      : "선택 전 상태";
    setFeedbackMessage(
      `${undoneCard?.hint.title ?? "카드"}: ${restoredLabel}로 복원했습니다.`,
    );
  }

  function resetCurrentStatus() {
    if (!selectedCard || !statuses[selectedCard.id]) return;

    const nextStatuses = { ...statuses };
    delete nextStatuses[selectedCard.id];
    saveStatuses(nextStatuses);
    setStatuses(nextStatuses);
    setFeedbackMessage(
      `${selectedCard.hint.title}: 현재 상태만 초기화했습니다. 학습 기록은 유지됩니다.`,
    );
  }

  function saveMyAnswer(cardId: string, answer: string) {
    setMyAnswers((current) => setMyAnswer(current, cardId, answer));
  }

  function removeMyAnswer(cardId: string) {
    setMyAnswers((current) => deleteMyAnswer(current, cardId));
  }

  function addMemo(cardId: string, content: string) {
    setCardMemos((current) => createCardMemo(current, cardId, content).cardMemos);
  }

  function editMemo(cardId: string, memoId: string, content: string) {
    setCardMemos((current) => updateCardMemo(current, cardId, memoId, content));
  }

  function toggleMemoPinned(cardId: string, memoId: string) {
    setCardMemos((current) => toggleCardMemoPinned(current, cardId, memoId));
  }

  function removeMemo(cardId: string, memoId: string) {
    setCardMemos((current) => deleteCardMemo(current, cardId, memoId).cardMemos);
  }

  function restoreMemo(memo: CardMemo, index: number) {
    setCardMemos((current) => restoreCardMemo(current, memo, index));
  }

  function createPassage(title: string, text: string) {
    const result = addSavedPassage(savedPassageDataset, title, text);
    setSavedPassageDataset(result.dataset);
    return result.passage;
  }

  function editPassage(passageId: string, title: string, text: string) {
    const result = updateSavedPassage(
      savedPassageDataset,
      passageId,
      title,
      text,
    );
    setSavedPassageDataset(result.dataset);
    return result.passage;
  }

  function removePassage(passageId: string) {
    const result = deleteSavedPassage(savedPassageDataset, passageId);
    setSavedPassageDataset(result.dataset);
    return result.deleted
      ? { passage: result.deleted, index: result.index }
      : null;
  }

  function restorePassage(deleted: { passage: SavedPassage; index: number }) {
    setSavedPassageDataset((current) =>
      restoreSavedPassage(current, deleted.passage, deleted.index),
    );
  }

  function openPersonalMemos(startNew = false) {
    savePersonalMemoLibrarySession(true);
    if (startNew) {
      savePersonalMemoEditorSession(createEmptyPersonalMemoEditorSession());
    }
    setSelectedCardId(null);
    setView("personalMemos");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closePersonalMemos() {
    savePersonalMemoLibrarySession(false);
    clearPersonalMemoEditorSession();
    setView("list");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function requestClosePersonalMemos() {
    const draft = readPersonalMemoEditorSession();
    if (
      draft?.dirty &&
      !window.confirm("저장하지 않은 개인 학습 메모가 있습니다. 변경 내용을 버릴까요?")
    ) {
      return;
    }
    closePersonalMemos();
  }

  function addPersonalMemo(title: string, content: string) {
    setPersonalMemoDataset((current) =>
      createPersonalMemo(current, title, content).dataset,
    );
  }

  function editPersonalMemo(memoId: string, title: string, content: string) {
    setPersonalMemoDataset((current) =>
      updatePersonalMemo(current, memoId, title, content).dataset,
    );
  }

  function pinPersonalMemo(memoId: string) {
    setPersonalMemoDataset((current) =>
      togglePersonalMemoPinned(current, memoId),
    );
  }

  function removePersonalMemo(memoId: string) {
    const result = deletePersonalMemo(personalMemoDataset, memoId);
    setPersonalMemoDataset(result.dataset);
    return result.deletedMemo
      ? { memo: result.deletedMemo, index: result.index }
      : null;
  }

  function undoPersonalMemoDelete(deleted: {
    memo: PersonalMemo;
    index: number;
  }) {
    setPersonalMemoDataset((current) =>
      restorePersonalMemo(current, deleted.memo, deleted.index),
    );
  }

  function openMemoCard(cardId: string, memoId: string) {
    const card = cardCatalog.find((candidate) => candidate.id === cardId);
    if (!card) return;
    clearCardDetailUiSession();
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds([]);
    setDetailReturnView("library");
    setSelectedCardId(card.id);
    setMemoFocus({ cardId, memoId });
    window.history.pushState({ ...window.history.state, opicView: "detail" }, "");
    setView("detail");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function toggleTheme() {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }

  function resetFilters() {
    setSelectedDeck("all");
    setSelectedTag("all");
    setFinalOnly(false);
    setHardOnly(false);
    setCardScope("all");
    setStudyOrder("default");
    setAnswerLearningStatusFilter("all");
    setAnswerContentFilter("all");
  }

  function handleCardsChange(nextCards: OpicCard[]) {
    const nextIds = new Set(nextCards.map((card) => card.id));
    const nextDrillIds = drillCardIds.filter((cardId) => nextIds.has(cardId));
    const nextAnswerIds = answerSession.selectedCardIds.filter((cardId) => nextIds.has(cardId));
    const nextAnswerOrder = answerSession.cardOrder.filter((cardId) => nextIds.has(cardId));
    const selectedCardStillExists =
      selectedCardId === null || nextIds.has(selectedCardId);

    setCardCatalog(nextCards);
    setCardStorageWarning(false);
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds(nextDrillIds);
    updateAnswerSession({
      ...answerSession,
      selectedCardIds: nextAnswerIds,
      cardOrder: nextAnswerOrder,
      currentIndex: Math.min(answerSession.currentIndex, Math.max(nextAnswerOrder.length - 1, 0)),
      screen: answerSession.screen === "learning" && nextAnswerOrder.length === 0 ? "setup" : answerSession.screen,
    });

    if (
      selectedDeck !== "all" &&
      !nextCards.some((card) => card.deck === selectedDeck)
    ) {
      setSelectedDeck("all");
    }
    if (
      selectedTag !== "all" &&
      !nextCards.some((card) => card.tags.includes(selectedTag))
    ) {
      setSelectedTag("all");
    }

    if (
      !selectedCardStillExists ||
      (view === "drill" && nextDrillIds.length === 0) ||
      (view === "answerLearning" && nextAnswerOrder.length === 0)
    ) {
      setSelectedCardId(null);
      setView("list");
    }
  }

  if (view === "shadowing" && shadowingSource) {
    return (
      <ShadowingPlayer
        key={`${shadowingSource.cardId ?? shadowingSource.savedPassageId ?? "custom"}-${shadowingSource.sourceType}`}
        source={shadowingSource}
        card={selectedCard}
        myAnswer={selectedCard ? myAnswers[selectedCard.id] : undefined}
        currentCardPosition={currentPosition}
        totalCards={activeCards.length}
        canGoPreviousCard={Boolean(selectedCard) && canGoPrevious}
        canGoNextCard={Boolean(selectedCard) && canGoNext}
        theme={theme}
        onToggleTheme={toggleTheme}
        onPreviousCard={() => navigateShadowingCard(-1)}
        onNextCard={() => navigateShadowingCard(1)}
        onSourceTypeChange={changeShadowingSource}
        onBack={() => {
          if (window.history.state?.opicShadowing) {
            window.history.back();
            return;
          }
          clearShadowingPlayerSession();
          setShadowingSource(null);
          if (shadowingReturnView === "answerLearning" && selectedCard) {
            setView("answerLearning");
          } else if (shadowingReturnView === "detail" && selectedCard) {
            setView("detail");
          } else {
            setSelectedCardId(null);
            setView("list");
          }
          window.scrollTo({ top: 0, behavior: "auto" });
        }}
      />
    );
  }

  if (view === "drillSetup") {
    return (
      <div className="app-shell">
        <AppHeader theme={theme} studyTitle="첫 문장 연습 준비" onBack={() => setView("list")} onToggleTheme={toggleTheme} />
        <FirstLineSetup
          cardCount={orderedFilteredCards.length}
          decks={decks}
          tags={tags}
          selectedDeck={selectedDeck}
          selectedTag={selectedTag}
          finalOnly={finalOnly}
          hardOnly={hardOnly}
          cardScope={cardScope}
          studyOrder={studyOrder}
          answerContentFilter={answerContentFilter}
          mode={firstLineMode}
          questionCount={mockQuestionCount}
          onDeckChange={setSelectedDeck}
          onTagChange={setSelectedTag}
          onFinalOnlyChange={setFinalOnly}
          onHardOnlyChange={setHardOnly}
          onCardScopeChange={setCardScope}
          onStudyOrderChange={setStudyOrder}
          onAnswerContentFilterChange={setAnswerContentFilter}
          onModeChange={setFirstLineMode}
          onQuestionCountChange={setMockQuestionCount}
          onReset={resetFilters}
          onStart={startFirstLineFromSetup}
          onBack={() => setView("list")}
        />
      </div>
    );
  }

  if (view === "answerSetup") {
    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="답변 익히기 준비"
          onBack={closeAnswerLearning}
          onToggleTheme={toggleTheme}
        />
        <AnswerLearningSetup
          cards={cardCatalog}
          decks={decks}
          tags={tags}
          statuses={answerLearningStatuses}
          myAnswers={myAnswers}
          cardMemos={cardMemos}
          attemptCounts={answerLearningAttemptCounts}
          session={answerSession}
          onSessionChange={updateAnswerSession}
          onStart={startAnswerLearning}
          onBack={closeAnswerLearning}
        />
      </div>
    );
  }

  if (selectedCard && view === "answerLearning") {
    const reveal = answerSession.reveals[selectedCard.id] ?? {
      hint: false,
      firstLine: false,
      answer: false,
      frontKo: false,
    };
    const answerSource =
      answerSession.answerSources[selectedCard.id] === "my-answer" && myAnswers[selectedCard.id]
        ? "my-answer"
        : "default";
    const undoCard = answerLearningUndo
      ? cardCatalog.find((card) => card.id === answerLearningUndo.cardId)
      : null;
    const answerStatusLabels = {
      hard: "어려움",
      learning: "익히는 중",
      speakable: "말할 수 있음",
    } as const;
    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="답변 익히기"
          mobileSticky
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          onBack={leaveAnswerLearning}
          onToggleTheme={toggleTheme}
        />
        <AnswerLearning
          card={selectedCard}
          myAnswer={myAnswers[selectedCard.id]}
          status={answerLearningStatuses[selectedCard.id] ?? null}
          answerSource={answerSource}
          reveal={reveal}
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          undoTarget={answerLearningUndo && undoCard ? {
            cardTitle: undoCard.hint.title,
            statusLabel: answerStatusLabels[answerLearningUndo.newStatus],
          } : null}
          feedbackMessage={answerLearningFeedback}
          onAnswerSourceChange={(source) =>
            updateAnswerSession({
              ...answerSession,
              answerSources: { ...answerSession.answerSources, [selectedCard.id]: source },
            })
          }
          onRevealChange={(nextReveal) =>
            updateAnswerSession({
              ...answerSession,
              reveals: { ...answerSession.reveals, [selectedCard.id]: nextReveal },
            })
          }
          onPrevious={() => navigateAnswerLearning(-1)}
          onNext={() => navigateAnswerLearning(1)}
          onStatusChange={updateAnswerLearningStatus}
          onUndo={undoAnswerLearningStatus}
          onReset={resetAnswerLearningStatus}
          onStartShadowing={startAnswerLearningShadowing}
          onBack={leaveAnswerLearning}
        />
      </div>
    );
  }

  if (view === "personalMemos") {
    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="개인 학습 메모"
          onBack={requestClosePersonalMemos}
          onToggleTheme={toggleTheme}
        />
        <PersonalMemoLibrary
          dataset={personalMemoDataset}
          onBack={closePersonalMemos}
          onCreate={addPersonalMemo}
          onUpdate={editPersonalMemo}
          onTogglePinned={pinPersonalMemo}
          onDelete={removePersonalMemo}
          onRestore={undoPersonalMemoDelete}
        />
      </div>
    );
  }

  if (view === "library") {
    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="카드 라이브러리"
          onBack={closeCardLibrary}
          onToggleTheme={toggleTheme}
        />
        <CardLibrary
          cards={orderedFilteredCards}
          memoCards={cardCatalog}
          catalogCount={cardCatalog.length}
          statuses={statuses}
          answerLearningStatuses={answerLearningStatuses}
          myAnswers={myAnswers}
          cardMemos={cardMemos}
          decks={decks}
          tags={tags}
          selectedDeck={selectedDeck}
          selectedTag={selectedTag}
          finalOnly={finalOnly}
          hardOnly={hardOnly}
          cardScope={cardScope}
          studyOrder={studyOrder}
          filterSignature={filterSignature}
          onDeckChange={setSelectedDeck}
          onTagChange={setSelectedTag}
          onFinalOnlyChange={setFinalOnly}
          onHardOnlyChange={setHardOnly}
          onCardScopeChange={setCardScope}
          onStudyOrderChange={setStudyOrder}
          onReset={resetFilters}
          onSelect={(card) => openCard(card, "library")}
          answerLearningStatusFilter={answerLearningStatusFilter}
          onAnswerLearningStatusFilterChange={setAnswerLearningStatusFilter}
          answerContentFilter={answerContentFilter}
          onAnswerContentFilterChange={setAnswerContentFilter}
          onOpenMemoCard={openMemoCard}
        />
      </div>
    );
  }

  if (view === "drill" && mockSession?.screen === "complete") {
    return (
      <div className="app-shell">
        <AppHeader theme={theme} studyTitle="첫 문장 모의고사 결과" onBack={() => { clearFirstLineMockSession(); setMockSession(null); setSelectedCardId(null); setView("list"); }} onToggleTheme={toggleTheme} />
        <FirstLineMockResult
          session={mockSession}
          cards={cardCatalog}
          onRetryHard={() => restartMock(mockSession.cardOrder.filter((id) => mockSession.answers[id] === "hard"), "all")}
          onRestart={() => restartMock(mockSession.sourceCardIds, mockSession.questionCount)}
          onHome={() => { clearFirstLineMockSession(); setMockSession(null); setDrillCardIds([]); setSelectedCardId(null); setView("list"); window.scrollTo({ top: 0, behavior: "auto" }); }}
        />
      </div>
    );
  }

  if (selectedCard && view === "drill") {
    const undoCard = lastUndo
      ? cardCatalog.find((card) => card.id === lastUndo.cardId) ?? null
      : null;
    const leaveDrill = () => {
      clearFirstLineMockSession();
      setMockSession(null);
      setLastUndo(null);
      setFeedbackMessage(null);
      if (drillReturnView === "list") {
        setSelectedCardId(null);
        setView("list");
      } else {
        setView("detail");
      }
    };

    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="첫 문장 훈련"
          mobileSticky
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          onBack={leaveDrill}
          onToggleTheme={toggleTheme}
        />
        <FirstLineDrill
          card={selectedCard}
          status={statuses[selectedCard.id] ?? null}
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          backLabel={drillReturnView === "list" ? "카드 목록" : "카드 상세"}
          undoTarget={
            lastUndo && undoCard
              ? {
                  cardId: lastUndo.cardId,
                  cardTitle: undoCard.hint.title,
                  statusLabel: statusLabels[lastUndo.newStatus],
                }
              : null
          }
          feedbackMessage={feedbackMessage}
          onStatusChange={updateStatus}
          onUndo={undoLastStatus}
          onResetStatus={resetCurrentStatus}
          onBack={leaveDrill}
          onPrevious={() => navigateCard(-1, "manual")}
          onNext={(source) => navigateCard(1, source)}
          mode={mockSession ? "mock" : "practice"}
        />
      </div>
    );
  }

  if (selectedCard && view === "detail") {
    return (
      <div className="app-shell">
        <AppHeader
          theme={theme}
          studyTitle="카드 상세"
          onToggleTheme={toggleTheme}
        />
        <CardDetail
          card={selectedCard}
          status={statuses[selectedCard.id] ?? null}
          answerLearningStatus={answerLearningStatuses[selectedCard.id] ?? null}
          myAnswer={myAnswers[selectedCard.id]}
          memos={cardMemos[selectedCard.id] ?? []}
          focusMemoId={memoFocus?.cardId === selectedCard.id ? memoFocus.memoId : null}
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onBack={closeCardDetail}
          onPrevious={() => navigateCard(-1)}
          onNext={() => navigateCard(1)}
          onStartDrill={() => {
            const nextDrillCardIds = createDrillCardIds(orderedFilteredCards);
            if (!nextDrillCardIds.includes(selectedCard.id)) {
              nextDrillCardIds.unshift(selectedCard.id);
            }
            setLastUndo(null);
            clearFirstLineMockSession();
            setMockSession(null);
            setFeedbackMessage(null);
            setMemoFocus(null);
            setDrillCardIds(nextDrillCardIds);
            setDrillReturnView("detail");
            setView("drill");
          }}
          onStartAnswerLearning={() => startSingleCardAnswerLearning(selectedCard)}
          onSaveMyAnswer={saveMyAnswer}
          onDeleteMyAnswer={removeMyAnswer}
          onCreateMemo={addMemo}
          onUpdateMemo={editMemo}
          onToggleMemoPinned={toggleMemoPinned}
          onDeleteMemo={removeMemo}
          onRestoreMemo={restoreMemo}
          onStartShadowing={startCardShadowing}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader theme={theme} onToggleTheme={toggleTheme} />

      <div className="home-layout-shell">
        <main className="home-page">
          <div className="home-content-rail">
            <section className="hero-panel">
              <div>
                <span className="hero-label">WEEK 6 · START SMALL</span>
                <h2>질문을 보고, 먼저 입으로 꺼내보세요.</h2>
                <p>
                  완벽한 답변보다 첫 문장을 빠르게 시작하는 힘을 기릅니다.
                  막히면 힌트를 보고 다시 말해도 괜찮아요.
                </p>
              </div>
              <div className="hero-rule compact-learning-tile">
                <span>오늘의 규칙</span>
                <strong>3초 안에 첫 문장</strong>
              </div>
            </section>

            <HomeQuickStart
              canStartFirstLine={orderedFilteredCards.length > 0}
              onStartFirstLine={openFirstLineSetup}
              onStartAnswerLearning={openAnswerLearningSetup}
              onOpenShadowing={() =>
                document.getElementById("direct-practice-title")?.scrollIntoView({ behavior: "smooth" })
              }
            />

            <TodayStats stats={todayStats} answerStats={answerLearningTodayStats} />

            <section className="home-learning-materials" aria-labelledby="home-learning-materials-title">
              <div className="section-title-row home-learning-materials-heading">
                <div>
                  <p className="eyebrow">MY LEARNING MATERIALS</p>
                  <h2 id="home-learning-materials-title" className="home-section-title">내 학습 자료</h2>
                </div>
              </div>
              <HomeCardDashboard
                totalCount={cardCatalog.length}
                filteredCount={orderedFilteredCards.length}
                filterSummary={filterSummary}
                onOpenLibrary={openCardLibrary}
                onStartDrill={openFirstLineSetup}
              />

              <DirectTextPractice
                passages={savedPassageDataset.passages}
                onCreate={createPassage}
                onUpdate={editPassage}
                onDelete={removePassage}
                onRestore={restorePassage}
                onStart={startDirectShadowing}
              />

              <PersonalMemoSummary
                dataset={personalMemoDataset}
                onOpenLibrary={() => openPersonalMemos(false)}
                onStartNew={() => openPersonalMemos(true)}
              />
            </section>

            <HomeManagement initialExpanded={postRestoreNavigation?.managementExpanded}>
              <StudyDaySettings
                value={studyDayStartTime}
                onChange={setStudyDayStartTime}
              />
              <CardDataManager
                cards={cardCatalog}
                storageWarning={cardStorageWarning}
                onCardsChange={handleCardsChange}
              />

              <BackupManager
                cards={cardCatalog}
                statuses={statuses}
                attemptsByDate={studyAttempts}
                myAnswers={myAnswers}
                cardMemos={cardMemos}
                savedPassages={savedPassageDataset}
                personalMemos={personalMemoDataset}
                answerLearningStatuses={answerLearningStatuses}
                answerLearningAttemptsByDate={answerLearningAttempts}
                postRestoreMessage={postRestoreNavigation?.message}
              />
            </HomeManagement>
          </div>
        </main>

        <footer className="app-footer">
          <p>짧게 시작하고, 끝까지 말하기.</p>
          <span>OPIc Speaking Trainer · Local MVP</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
