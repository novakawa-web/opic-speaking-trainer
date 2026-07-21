import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  StorageTransactionError,
  applyStorageMutations,
  captureStorageSnapshot,
  isStorageQuotaExceededError,
  restoreStorageSnapshot,
  runStorageTransaction,
} from "../src/utils/storageTransaction.ts";

class InjectedStorageError extends Error {
  constructor(name = "InjectedStorageError", code) {
    super("Injected Web Storage failure");
    this.name = name;
    if (code !== undefined) this.code = code;
  }
}

class MockStorage {
  values = new Map();
  calls = [];
  failures = [];
  counts = { getItem: 0, setItem: 0, removeItem: 0 };

  constructor(initial = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, String(value));
  }

  fail({ method, nth, key, skipMatches = 0, times = 1, error = new InjectedStorageError() }) {
    this.failures.push({ method, nth, key, skipMatches, times, error, matches: 0 });
  }

  maybeFail(method, key) {
    this.counts[method] += 1;
    for (const failure of this.failures) {
      if (failure.method !== method) continue;
      if (failure.key !== undefined && failure.key !== key) continue;
      if (failure.nth !== undefined && failure.nth !== this.counts[method]) continue;
      failure.matches += 1;
      if (failure.matches <= failure.skipMatches) continue;
      if (failure.times !== Infinity && failure.matches > failure.skipMatches + failure.times) continue;
      throw failure.error;
    }
  }

  getItem(key) {
    this.calls.push({ method: "getItem", key });
    this.maybeFail("getItem", key);
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.calls.push({ method: "setItem", key });
    this.maybeFail("setItem", key);
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.calls.push({ method: "removeItem", key });
    this.maybeFail("removeItem", key);
    this.values.delete(key);
  }

  raw(key) { return this.values.has(key) ? this.values.get(key) : null; }
  clearCalls() { this.calls.length = 0; }
}

const local = (storage, key, value) => ({ area: "local", storage, key, value });
const session = (storage, key, value) => ({ area: "session", storage, key, value });
const tests = [];
const test = (name, run) => tests.push({ name, run });

function expectTransactionError(run, expected = {}) {
  let caught;
  try { run(); } catch (error) { caught = error; }
  assert.ok(caught instanceof StorageTransactionError);
  for (const [key, value] of Object.entries(expected)) assert.equal(caught[key], value);
  return caught;
}

test("단일 setItem 성공", () => {
  const storage = new MockStorage({ a: "old" });
  const result = runStorageTransaction([local(storage, "a", "new")]);
  assert.equal(storage.raw("a"), "new");
  assert.equal(result.appliedMutationCount, 1);
});

test("단일 removeItem 성공", () => {
  const storage = new MockStorage({ a: "old" });
  runStorageTransaction([local(storage, "a", null)]);
  assert.equal(storage.raw("a"), null);
});

test("localStorage와 sessionStorage 혼합 성공", () => {
  const localStorage = new MockStorage();
  const sessionStorage = new MockStorage();
  runStorageTransaction([
    local(localStorage, "local-key", "local-value"),
    session(sessionStorage, "session-key", "session-value"),
  ]);
  assert.equal(localStorage.raw("local-key"), "local-value");
  assert.equal(sessionStorage.raw("session-key"), "session-value");
});

test("기존 raw string byte-for-byte 보존", () => {
  const raw = " {\r\n  \"value\": [1, 2], \"tail\": \"  \"\r\n} ";
  const storage = new MockStorage({ raw });
  const snapshot = captureStorageSnapshot([local(storage, "raw")]);
  assert.equal(snapshot[0].value, raw);
});

test("없던 key의 null snapshot", () => {
  const storage = new MockStorage();
  assert.equal(captureStorageSnapshot([local(storage, "missing")])[0].value, null);
});

test("중복 target mutation 사전 거부", () => {
  const storage = new MockStorage({ a: "old" });
  expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "one"),
    session(storage, "a", "two"),
  ]), { phase: "snapshot", key: "a" });
  assert.equal(storage.calls.length, 0);
});

test("snapshot 첫 항목 실패", () => {
  const storage = new MockStorage({ a: "old" });
  storage.fail({ method: "getItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([local(storage, "a", "new")]), {
    phase: "snapshot", area: "local", key: "a", rollbackSucceeded: true,
  });
  assert.equal(storage.raw("a"), "old");
});

test("snapshot 중간 항목 실패", () => {
  const storage = new MockStorage({ a: "A", b: "B" });
  storage.fail({ method: "getItem", nth: 2 });
  expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "new-a"), local(storage, "b", "new-b"),
  ]), { phase: "snapshot", key: "b" });
  assert.deepEqual([...storage.values], [["a", "A"], ["b", "B"]]);
  assert.equal(storage.calls.some((call) => call.method !== "getItem"), false);
});

test("apply 첫 mutation 실패", () => {
  const storage = new MockStorage({ a: "A", b: "B" });
  storage.fail({ method: "setItem", nth: 1 });
  const error = expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "new-a"), local(storage, "b", "new-b"),
  ]), { phase: "apply", key: "a", appliedMutationCount: 0, rollbackSucceeded: true });
  assert.equal(error.rollbackFailureCount, 0);
  assert.equal(storage.raw("a"), "A");
  assert.equal(storage.raw("b"), "B");
});

test("apply 중간 mutation 실패 후 전체 rollback", () => {
  const storage = new MockStorage({ a: "A", b: "B", c: "C" });
  storage.fail({ method: "setItem", nth: 2 });
  expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "1"), local(storage, "b", "2"), local(storage, "c", "3"),
  ]), { rollbackSucceeded: true, appliedMutationCount: 1 });
  assert.deepEqual([...storage.values], [["a", "A"], ["b", "B"], ["c", "C"]]);
});

test("apply 마지막 mutation 실패 후 전체 rollback", () => {
  const storage = new MockStorage({ a: "A", b: "B", c: "C" });
  storage.fail({ method: "setItem", nth: 3 });
  expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "1"), local(storage, "b", "2"), local(storage, "c", "3"),
  ]), { key: "c", rollbackSucceeded: true, appliedMutationCount: 2 });
  assert.deepEqual([...storage.values], [["a", "A"], ["b", "B"], ["c", "C"]]);
});

test("local 적용 후 session 실패 시 local rollback", () => {
  const localStorage = new MockStorage({ a: "A" });
  const sessionStorage = new MockStorage({ b: "B" });
  sessionStorage.fail({ method: "setItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([
    local(localStorage, "a", "new-a"), session(sessionStorage, "b", "new-b"),
  ]), { area: "session", rollbackSucceeded: true });
  assert.equal(localStorage.raw("a"), "A");
  assert.equal(sessionStorage.raw("b"), "B");
});

test("session 적용 후 local 실패 시 session rollback", () => {
  const sessionStorage = new MockStorage({ a: "A" });
  const localStorage = new MockStorage({ b: "B" });
  localStorage.fail({ method: "setItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([
    session(sessionStorage, "a", "new-a"), local(localStorage, "b", "new-b"),
  ]), { area: "local", rollbackSucceeded: true });
  assert.equal(sessionStorage.raw("a"), "A");
  assert.equal(localStorage.raw("b"), "B");
});

test("rollback 한 항목 실패해도 나머지 계속 복원", () => {
  const storage = new MockStorage({ a: "A", b: "B", c: "C" });
  storage.fail({ method: "setItem", key: "b", skipMatches: 1 });
  storage.fail({ method: "setItem", key: "c", times: 1 });
  const error = expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "1"), local(storage, "b", "2"), local(storage, "c", "3"),
  ]), { rollbackSucceeded: false, rollbackFailureCount: 1 });
  assert.deepEqual(error.rollbackFailures, [
    { area: "local", key: "b", quotaExceeded: false },
  ]);
  assert.equal(storage.raw("a"), "A");
  assert.equal(storage.raw("b"), "2");
});

test("rollback 실패 개수 정확성", () => {
  const storage = new MockStorage({ a: "A", b: "B", c: "C" });
  storage.fail({ method: "setItem", key: "a", skipMatches: 1 });
  storage.fail({ method: "setItem", key: "b", skipMatches: 1 });
  storage.fail({ method: "setItem", key: "c", times: 1 });
  const error = expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "1"), local(storage, "b", "2"), local(storage, "c", "3"),
  ]));
  assert.equal(error.rollbackFailureCount, 2);
});

test("rollbackSucceeded 값 정확성", () => {
  const ok = new MockStorage({ a: "A", b: "B" });
  ok.fail({ method: "setItem", nth: 2 });
  assert.equal(expectTransactionError(() => runStorageTransaction([
    local(ok, "a", "1"), local(ok, "b", "2"),
  ])).rollbackSucceeded, true);

  const failed = new MockStorage({ a: "A", b: "B" });
  failed.fail({ method: "setItem", key: "a", skipMatches: 1 });
  failed.fail({ method: "setItem", key: "b", times: 1 });
  assert.equal(expectTransactionError(() => runStorageTransaction([
    local(failed, "a", "1"), local(failed, "b", "2"),
  ])).rollbackSucceeded, false);
});

test("setItem QuotaExceededError 분류", () => {
  const storage = new MockStorage({ a: "A" });
  storage.fail({ method: "setItem", nth: 1, error: new InjectedStorageError("QuotaExceededError") });
  assert.equal(expectTransactionError(() => runStorageTransaction([
    local(storage, "a", "new"),
  ])).quotaExceeded, true);
  assert.equal(isStorageQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(isStorageQuotaExceededError({ name: "DOMException", code: 22 }), true);
  assert.equal(isStorageQuotaExceededError({ name: "DOMException", code: 1014 }), true);
  assert.equal(isStorageQuotaExceededError({ name: "OtherError", code: 22 }), false);
});

test("removeItem 오류 처리", () => {
  const storage = new MockStorage({ a: "A" });
  storage.fail({ method: "removeItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([local(storage, "a", null)]), {
    phase: "apply", key: "a", rollbackSucceeded: true,
  });
  assert.equal(storage.raw("a"), "A");
});

test("getItem 오류 처리", () => {
  const storage = new MockStorage();
  storage.fail({ method: "getItem", key: "a" });
  expectTransactionError(() => captureStorageSnapshot([local(storage, "a")]), {
    phase: "snapshot", key: "a", rollbackFailureCount: 0,
  });
});

test("mutation 적용 순서 유지", () => {
  const storage = new MockStorage();
  applyStorageMutations([
    local(storage, "first", "1"), local(storage, "second", null), local(storage, "third", "3"),
  ]);
  assert.deepEqual(storage.calls.map(({ method, key }) => `${method}:${key}`), [
    "setItem:first", "removeItem:second", "setItem:third",
  ]);
});

test("rollback 순서 확인", () => {
  const storage = new MockStorage({ a: "A", b: "B", c: "C" });
  const snapshot = captureStorageSnapshot([
    local(storage, "a"), local(storage, "b"), local(storage, "c"),
  ]);
  storage.clearCalls();
  restoreStorageSnapshot(snapshot);
  assert.deepEqual(storage.calls.map(({ key }) => key), ["c", "b", "a"]);

  const failingStorage = new MockStorage({ a: "A" });
  failingStorage.fail({ method: "setItem", key: "a" });
  expectTransactionError(() => restoreStorageSnapshot([
    local(failingStorage, "a", "A"),
  ]), { phase: "rollback", rollbackSucceeded: false, rollbackFailureCount: 1 });
});

test("성공 시 불필요한 rollback 없음", () => {
  const storage = new MockStorage({ a: "A" });
  runStorageTransaction([local(storage, "a", "B")]);
  assert.deepEqual(storage.calls.map(({ method }) => method), ["getItem", "setItem"]);
});

test("오류 객체에 저장 value 미포함", () => {
  const secret = "PRIVATE-STORED-CONTENT-DO-NOT-LEAK";
  const storage = new MockStorage({ a: secret });
  storage.fail({ method: "setItem", nth: 1, error: new Error(secret) });
  const error = expectTransactionError(() => runStorageTransaction([local(storage, "a", secret)]));
  const serialized = `${error.message}\n${JSON.stringify(error)}`;
  assert.equal(serialized.includes(secret), false);
  assert.equal(Object.hasOwn(error, "cause"), false);
});

test("실제 window localStorage와 sessionStorage 미사용", () => {
  const source = readFileSync(new URL("../src/utils/storageTransaction.ts", import.meta.url), "utf8");
  assert.equal(/window\.(?:localStorage|sessionStorage)|globalThis\.(?:localStorage|sessionStorage)/.test(source), false);
  const storage = new MockStorage();
  runStorageTransaction([local(storage, "a", "A")]);
  assert.equal(storage.raw("a"), "A");
});

test("자동 재시도 없음", () => {
  const storage = new MockStorage({ a: "A" });
  storage.fail({ method: "setItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([local(storage, "a", "B")]));
  assert.equal(storage.calls.filter(({ method }) => method === "setItem").length, 2);
});

test("한 transaction을 다시 명시적으로 실행 가능", () => {
  const storage = new MockStorage({ a: "A" });
  storage.fail({ method: "setItem", nth: 1 });
  expectTransactionError(() => runStorageTransaction([local(storage, "a", "B")]));
  const result = runStorageTransaction([local(storage, "a", "B")]);
  assert.equal(result.appliedMutationCount, 1);
  assert.equal(storage.raw("a"), "B");
});

test("원래 null key가 rollback 후 다시 없음", () => {
  const storage = new MockStorage({ stop: "S" });
  storage.fail({ method: "setItem", key: "stop", times: 1 });
  expectTransactionError(() => runStorageTransaction([
    local(storage, "missing", "created"), local(storage, "stop", "fail"),
  ]));
  assert.equal(storage.raw("missing"), null);
});

test("원래 빈 문자열과 null 구분", () => {
  const storage = new MockStorage({ empty: "" });
  const snapshot = captureStorageSnapshot([
    local(storage, "empty"), local(storage, "missing"),
  ]);
  assert.equal(snapshot[0].value, "");
  assert.equal(snapshot[1].value, null);
});

test("Unicode와 큰 JSON 문자열 raw 보존", () => {
  const raw = JSON.stringify({ korean: "안녕하세요", emoji: "🎙️", data: "값".repeat(20000) });
  const storage = new MockStorage({ raw });
  const result = runStorageTransaction([local(storage, "raw", "temporary")]);
  restoreStorageSnapshot(result.snapshot);
  assert.equal(storage.raw("raw"), raw);
});

test("성공 결과 snapshot은 향후 raw undo에 사용 가능", () => {
  const storage = new MockStorage({ keep: "original", remove: "present" });
  const result = runStorageTransaction([
    local(storage, "keep", "changed"), local(storage, "remove", null), local(storage, "new", "created"),
  ]);
  restoreStorageSnapshot(result.snapshot);
  assert.equal(storage.raw("keep"), "original");
  assert.equal(storage.raw("remove"), "present");
  assert.equal(storage.raw("new"), null);
});

let passed = 0;
for (const { name, run } of tests) {
  try {
    await run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\nStorage transaction verification: ${passed}/${tests.length} passed`);
