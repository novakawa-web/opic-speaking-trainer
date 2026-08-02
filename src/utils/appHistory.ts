export const APP_HISTORY_STATE_KEY = "opicHistory";

export type AppView =
  | "list"
  | "library"
  | "createCard"
  | "detail"
  | "drillSetup"
  | "drill"
  | "answerSetup"
  | "answerLearning"
  | "shadowing"
  | "personalMemos";

export type AppHistoryEntry = {
  version: 1;
  view: AppView;
  depth: number;
};

export type AppBackContext = {
  detailReturnView: "home" | "library";
  drillReturnView: "list" | "detail";
  answerLearningReturnView: "setup" | "detail";
  shadowingReturnView: "detail" | "direct" | "answerLearning";
};

type HistoryWriter = {
  state: unknown;
  pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
};

const appViews = new Set<AppView>([
  "list",
  "library",
  "createCard",
  "detail",
  "drillSetup",
  "drill",
  "answerSetup",
  "answerLearning",
  "shadowing",
  "personalMemos",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readAppHistoryEntry(state: unknown): AppHistoryEntry | null {
  if (!isRecord(state) || !isRecord(state[APP_HISTORY_STATE_KEY])) return null;
  const entry = state[APP_HISTORY_STATE_KEY];
  if (
    entry.version !== 1 ||
    !appViews.has(entry.view as AppView) ||
    !Number.isInteger(entry.depth) ||
    Number(entry.depth) < 0
  ) {
    return null;
  }

  return {
    version: 1,
    view: entry.view as AppView,
    depth: Number(entry.depth),
  };
}

export function createAppHistoryState(
  currentState: unknown,
  view: AppView,
  depth: number,
) {
  const base = isRecord(currentState) ? { ...currentState } : {};
  delete base.opicView;
  delete base.opicShadowing;
  return {
    ...base,
    [APP_HISTORY_STATE_KEY]: {
      version: 1,
      view,
      depth: Math.max(0, Math.trunc(depth)),
    } satisfies AppHistoryEntry,
  };
}

export function getNextAppHistoryDepth(state: unknown) {
  return (readAppHistoryEntry(state)?.depth ?? 0) + 1;
}

export function replaceAppHistoryView(
  history: HistoryWriter,
  view: AppView,
  depth = readAppHistoryEntry(history.state)?.depth ?? 0,
) {
  history.replaceState(createAppHistoryState(history.state, view, depth), "");
}

export function pushAppHistoryView(history: HistoryWriter, view: AppView) {
  history.pushState(
    createAppHistoryState(history.state, view, getNextAppHistoryDepth(history.state)),
    "",
  );
}

export function isCurrentAppHistoryView(state: unknown, view: AppView) {
  return readAppHistoryEntry(state)?.view === view;
}

export function shouldCheckHomeNavigationGuard(
  view: AppView,
  preserveEditorDraft = false,
) {
  return view === "list" && !preserveEditorDraft;
}

export function getAppBackView(
  view: AppView,
  context: AppBackContext,
): AppView | null {
  switch (view) {
    case "list":
      return null;
    case "library":
    case "drillSetup":
    case "answerSetup":
    case "personalMemos":
      return "list";
    case "createCard":
      return "library";
    case "detail":
      return context.detailReturnView === "library" ? "library" : "list";
    case "drill":
      return context.drillReturnView === "detail" ? "detail" : "list";
    case "answerLearning":
      return context.answerLearningReturnView === "detail" ? "detail" : "answerSetup";
    case "shadowing":
      if (context.shadowingReturnView === "detail") return "detail";
      if (context.shadowingReturnView === "answerLearning") return "answerLearning";
      return "list";
  }
}
