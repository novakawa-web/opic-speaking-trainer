import type { AnswerLearningAnswerSource, OpicCard } from "../types.ts";
import { joinAnswerLines } from "./answerText.ts";
import {
  createAnswerLearningSentenceCheckIds,
  type AnswerLearningSentenceChecks,
} from "./answerLearningSentenceChecks.ts";
import {
  createPassageParagraphs,
  flattenParagraphSentences,
} from "./passageParagraphs.ts";

export type CheckedSentenceReviewSentence = {
  id: string;
  source: AnswerLearningAnswerSource;
  sentenceIndex: number;
  text: string;
};

export type CheckedSentenceReviewAnswer = {
  source: AnswerLearningAnswerSource;
  text: string;
};

export type CheckedSentenceReviewCard = {
  card: OpicCard;
  sentences: CheckedSentenceReviewSentence[];
  answers: CheckedSentenceReviewAnswer[];
};

export function createCheckedSentenceReviewCards(
  cards: readonly OpicCard[],
  myAnswers: Readonly<Record<string, string>>,
  checks: AnswerLearningSentenceChecks,
): CheckedSentenceReviewCard[] {
  return cards.flatMap((card) => {
    const sources: Array<[AnswerLearningAnswerSource, string]> = [
      ["default", joinAnswerLines(card.back)],
      ["my-answer", myAnswers[card.id] ?? ""],
    ];
    const sentences: CheckedSentenceReviewSentence[] = [];
    const answers: CheckedSentenceReviewAnswer[] = [];

    sources.forEach(([source, answerText]) => {
      if (!answerText.trim()) return;
      const answerSentences = flattenParagraphSentences(
        createPassageParagraphs(answerText),
      );
      const sentenceIds = createAnswerLearningSentenceCheckIds(answerSentences);
      const checkedIds = new Set(checks[card.id]?.[source] ?? []);
      const sourceSentences = answerSentences.flatMap((text, sentenceIndex) => {
        const id = sentenceIds[sentenceIndex];
        return id && checkedIds.has(id)
          ? [{ id, source, sentenceIndex, text }]
          : [];
      });
      if (sourceSentences.length === 0) return;
      sentences.push(...sourceSentences);
      answers.push({ source, text: answerText });
    });

    return sentences.length > 0 ? [{ card, sentences, answers }] : [];
  });
}

export function countCheckedSentenceReviewSentences(
  cards: readonly CheckedSentenceReviewCard[],
) {
  return cards.reduce((total, item) => total + item.sentences.length, 0);
}
