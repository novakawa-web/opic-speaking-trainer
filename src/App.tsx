import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { BackupManager } from "./components/BackupManager";
import { MemoSearch } from "./components/MemoSearch";
import { CardDataManager } from "./components/CardDataManager";
import { CardDetail } from "./components/CardDetail";
import { CardList } from "./components/CardList";
import { DrillStartPanel } from "./components/DrillStartPanel";
import { DirectTextPractice } from "./components/DirectTextPractice";
import { FirstLineDrill } from "./components/FirstLineDrill";
import { ShadowingPlayer } from "./components/ShadowingPlayer";
import { StudyDaySettings } from "./components/StudyDaySettings";
import { TagFilter } from "./components/TagFilter";
import { TodayStats } from "./components/TodayStats";
import { cards as defaultCards } from "./data/cards";
import type {
  DeckName,
  FirstLineResult,
  FirstLineStatusMap,
  OpicCard,
  StatusUndoEntry,
} from "./types";
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

type View = "list" | "detail" | "drill" | "shadowing";
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
      : stored.currentView === "home"
        ? ("list" as const)
        : stored.currentView,
    selectedCardId: restoredShadowingSource?.cardId ?? stored.selectedCardId,
    shadowingSource: restoredShadowingSource,
    shadowingReturnView: playerPassage ? ("direct" as const) : ("detail" as const),
    drillReturnView: stored.drillSource,
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
  const [theme, setTheme] = useState(readInitialTheme);
  const [view, setView] = useState<View>(initialNavigation.view);
  const [drillReturnView, setDrillReturnView] = useState<"list" | "detail">(
    initialNavigation.drillReturnView,
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
  const [memoFocus, setMemoFocus] = useState<{ cardId: string; memoId: string } | null>(null);
  const [studyAttempts, setStudyAttempts] = useState(readStudyAttempts);
  const [studyDayStartTime, setStudyDayStartTime] = useState(
    readStudyDayStartTime,
  );
  const [lastUndo, setLastUndo] = useState<StatusUndoEntry | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [shadowingSource, setShadowingSource] = useState<ShadowingSource | null>(
    initialNavigation.shadowingSource,
  );
  const [shadowingReturnView, setShadowingReturnView] = useState<"detail" | "direct">(
    initialNavigation.shadowingReturnView,
  );

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

  const filteredCards = useMemo(
    () =>
      cardCatalog.filter((card) => {
        const matchesDeck = selectedDeck === "all" || card.deck === selectedDeck;
        const matchesTag = selectedTag === "all" || card.tags.includes(selectedTag);
        const matchesFinal = !finalOnly || card.tags.includes("final_rep");
        const matchesHard = !hardOnly || statuses[card.id] === "hard";
        const matchesScope = cardScope === "all" || statuses[card.id] == null;

        return (
          matchesDeck &&
          matchesTag &&
          matchesFinal &&
          matchesHard &&
          matchesScope
        );
      }),
    [
      cardCatalog,
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
  const drillCards = useMemo(() => {
    const byId = new Map(cardCatalog.map((card) => [card.id, card]));
    return drillCardIds.flatMap((cardId) => {
      const card = byId.get(cardId);
      return card ? [card] : [];
    });
  }, [cardCatalog, drillCardIds]);
  const detailCards =
    drillReturnView === "detail" &&
    selectedCardId !== null &&
    drillCardIds.includes(selectedCardId)
      ? drillCards
      : orderedFilteredCards;
  const activeCards = view === "drill" ? drillCards : detailCards;
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
      !selectedCardId ||
      selectedFilteredIndex >= 0 ||
      (view === "drill" && drillCards.length === 0)
    ) {
      return;
    }

    // Invalid or filtered-out restored cards always return to a safe home state.
    setSelectedCardId(null);
    setView("list");
  }, [drillCards.length, selectedCardId, selectedFilteredIndex, view]);

  useEffect(() => {
    const persistedView =
      view === "shadowing"
        ? shadowingReturnView === "detail"
          ? "detail"
          : "home"
        : view === "list"
          ? "home"
          : view;
    saveNavigationSession({
      currentView: persistedView,
      selectedCardId: persistedView === "home" ? null : selectedCardId,
      drillSource: drillReturnView,
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
  }, [cardCatalog, selectedCardId, shadowingReturnView, view]);

  function openCard(card: OpicCard) {
    clearCardDetailUiSession();
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds([]);
    setMemoFocus(null);
    setShadowingSource(null);
    setSelectedCardId(card.id);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function changeShadowingSource(sourceType: "modelAnswer" | "myAnswer") {
    if (!selectedCard) return;
    if (sourceType === "myAnswer" && myAnswers[selectedCard.id]) {
      setShadowingSource(createMyAnswerSource(selectedCard, myAnswers[selectedCard.id]));
    } else {
      setShadowingSource(createModelAnswerSource(selectedCard));
    }
  }

  function startFilteredDrill() {
    const nextDrillCardIds = createDrillCardIds(orderedFilteredCards);
    const firstCardId = nextDrillCardIds[0];
    if (!firstCardId) return;

    setLastUndo(null);
    setFeedbackMessage(null);
    setMemoFocus(null);
    setDrillCardIds(nextDrillCardIds);
    setSelectedCardId(firstCardId);
    setDrillReturnView("list");
    setView("drill");
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

  function openMemoCard(cardId: string, memoId: string) {
    const card = cardCatalog.find((candidate) => candidate.id === cardId);
    if (!card) return;
    clearCardDetailUiSession();
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds([]);
    setSelectedCardId(card.id);
    setMemoFocus({ cardId, memoId });
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
  }

  function handleCardsChange(nextCards: OpicCard[]) {
    const nextIds = new Set(nextCards.map((card) => card.id));
    const nextDrillIds = drillCardIds.filter((cardId) => nextIds.has(cardId));
    const selectedCardStillExists =
      selectedCardId === null || nextIds.has(selectedCardId);

    setCardCatalog(nextCards);
    setCardStorageWarning(false);
    setLastUndo(null);
    setFeedbackMessage(null);
    setDrillCardIds(nextDrillIds);

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

    if (!selectedCardStillExists || (view === "drill" && nextDrillIds.length === 0)) {
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
          if (shadowingReturnView === "detail" && selectedCard) {
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

  if (selectedCard && view === "drill") {
    const undoCard = lastUndo
      ? cardCatalog.find((card) => card.id === lastUndo.cardId) ?? null
      : null;
    const leaveDrill = () => {
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
          myAnswer={myAnswers[selectedCard.id]}
          memos={cardMemos[selectedCard.id] ?? []}
          focusMemoId={memoFocus?.cardId === selectedCard.id ? memoFocus.memoId : null}
          currentPosition={currentPosition}
          totalCards={activeCards.length}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onBack={() => {
            clearCardDetailUiSession();
            setLastUndo(null);
            setFeedbackMessage(null);
            setSelectedCardId(null);
            setMemoFocus(null);
            setView("list");
          }}
          onPrevious={() => navigateCard(-1)}
          onNext={() => navigateCard(1)}
          onStartDrill={() => {
            const nextDrillCardIds = createDrillCardIds(orderedFilteredCards);
            if (!nextDrillCardIds.includes(selectedCard.id)) {
              nextDrillCardIds.unshift(selectedCard.id);
            }
            setLastUndo(null);
            setFeedbackMessage(null);
            setMemoFocus(null);
            setDrillCardIds(nextDrillCardIds);
            setDrillReturnView("detail");
            setView("drill");
          }}
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

      <main className="home-page">
        <section className="hero-panel">
          <div>
            <span className="hero-label">WEEK 6 · START SMALL</span>
            <h2>질문을 보고, 먼저 입으로 꺼내보세요.</h2>
            <p>
              완벽한 답변보다 첫 문장을 빠르게 시작하는 힘을 기릅니다.
              막히면 힌트를 보고 다시 말해도 괜찮아요.
            </p>
          </div>
          <div className="hero-rule">
            <span>오늘의 규칙</span>
            <strong>3초 안에 첫 문장</strong>
          </div>
        </section>

        <TodayStats stats={todayStats} />

        <StudyDaySettings
          value={studyDayStartTime}
          onChange={setStudyDayStartTime}
        />

        <TagFilter
          decks={decks}
          tags={tags}
          selectedDeck={selectedDeck}
          selectedTag={selectedTag}
          finalOnly={finalOnly}
          hardOnly={hardOnly}
          cardScope={cardScope}
          studyOrder={studyOrder}
          onDeckChange={setSelectedDeck}
          onTagChange={setSelectedTag}
          onFinalOnlyChange={setFinalOnly}
          onHardOnlyChange={setHardOnly}
          onCardScopeChange={setCardScope}
          onStudyOrderChange={setStudyOrder}
          onReset={resetFilters}
        />

        <DrillStartPanel
          cardCount={orderedFilteredCards.length}
          onStart={startFilteredDrill}
        />

        <DirectTextPractice
          passages={savedPassageDataset.passages}
          onCreate={createPassage}
          onUpdate={editPassage}
          onDelete={removePassage}
          onRestore={restorePassage}
          onStart={startDirectShadowing}
        />

        <CardList
          cards={orderedFilteredCards}
          statuses={statuses}
          myAnswers={myAnswers}
          cardMemos={cardMemos}
          onSelect={openCard}
        />

        <MemoSearch
          cards={cardCatalog}
          cardMemos={cardMemos}
          onOpenCard={openMemoCard}
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
        />
      </main>

      <footer className="app-footer">
        <p>짧게 시작하고, 끝까지 말하기.</p>
        <span>OPIc Speaking Trainer · Local MVP</span>
      </footer>
    </div>
  );
}

export default App;
