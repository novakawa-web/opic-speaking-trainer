import assert from "node:assert/strict";
import {
  FAVORITE_CARD_IDS_STORAGE_KEY,
  createNextFavoriteCardIds,
  matchesFavoriteFilter,
  normalizeFavoriteCardIds,
  parseFavoriteCardIds,
  readFavoriteCardIds,
  setCardFavorite,
} from "../src/utils/cardFavoriteStorage.ts";
import { filterAnswerLearningCards } from "../src/utils/answerLearningSelectors.ts";
import { DEFAULT_ANSWER_LEARNING_FILTERS } from "../src/utils/answerLearningSession.ts";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

assert.deepEqual(
  normalizeFavoriteCardIds(["card-1", "card-1", "", "__proto__", 42]),
  ["card-1"],
);
assert.deepEqual(parseFavoriteCardIds("not-json"), []);
assert.deepEqual(parseFavoriteCardIds('["card-2","card-1"]'), ["card-2", "card-1"]);

const storage = createStorage();
assert.deepEqual(readFavoriteCardIds(storage), []);
const added = setCardFavorite([], "card-1", true, storage);
assert.deepEqual(added, ["card-1"]);
assert.equal(storage.getItem(FAVORITE_CARD_IDS_STORAGE_KEY), '["card-1"]');
assert.deepEqual(createNextFavoriteCardIds(added, "card-1", true), ["card-1"]);
assert.deepEqual(setCardFavorite(added, "card-1", false, storage), []);
assert.equal(storage.getItem(FAVORITE_CARD_IDS_STORAGE_KEY), null);

assert.throws(() => createNextFavoriteCardIds([], "prototype", true));
assert.equal(matchesFavoriteFilter({ id: "card-1" }, ["card-1"], true), true);
assert.equal(matchesFavoriteFilter({ id: "card-2" }, ["card-1"], true), false);
assert.equal(matchesFavoriteFilter({ id: "card-2" }, [], false), true);

const rollbackStorage = createStorage({ [FAVORITE_CARD_IDS_STORAGE_KEY]: '["card-1"]' });
rollbackStorage.setItem = () => {
  throw new Error("write failed");
};
assert.throws(() => setCardFavorite(["card-1"], "card-2", true, rollbackStorage));
assert.equal(rollbackStorage.getItem(FAVORITE_CARD_IDS_STORAGE_KEY), '["card-1"]');

const cards = [
  { id: "card-1", deck: "A", tags: ["final_rep"] },
  { id: "card-2", deck: "A", tags: [] },
  { id: "card-3", deck: "B", tags: ["final_rep"] },
];
const favoriteFilters = {
  ...DEFAULT_ANSWER_LEARNING_FILTERS,
  favoriteOnly: true,
};
assert.deepEqual(
  filterAnswerLearningCards(cards, favoriteFilters, {}, {}, ["card-1", "card-2"])
    .map((card) => card.id),
  ["card-1", "card-2"],
);
assert.deepEqual(
  filterAnswerLearningCards(
    cards,
    { ...favoriteFilters, finalOnly: true },
    {},
    {},
    ["card-1", "card-2"],
  ).map((card) => card.id),
  ["card-1"],
);

console.log("CARD_FAVORITES_VERIFY=PASS");
