import type { JudgeResult } from '../ai/types';

export function judgeLocally(opts: {
  expected: string;
  actual: string;
  questionType: string;
  star: number;
}): JudgeResult {
  const expected = String(opts.expected || '');
  const actual = String(opts.actual || '');
  const isChoice = opts.questionType === 'choice';
  const isCorrect = isChoice
    ? normalizeChoice(expected) === normalizeChoice(actual)
    : compareTextAnswer(expected, actual);

  return {
    is_correct: isCorrect,
    score: isCorrect ? 1 : 0,
    error_type: isCorrect ? 'format' : 'other',
    feedback: isCorrect
      ? '答案正确。'
      : '答案与标准答案不一致，请对照原文检查错字、漏字或顺序。',
  };
}

function normalizeChoice(value: string): string {
  const normalized = value.trim().normalize('NFKC').toLocaleUpperCase();
  const leading = normalized.match(/^([A-Z])(?:[\s.???:?)?]|$)/);
  if (leading) return leading[1];
  return normalized.replace(/[\s.???:?)?]/g, '');
}

function compareTextAnswer(expected: string, actual: string): boolean {
  if (normalizeText(expected) === normalizeText(actual)) return true;

  const expectedParts = splitAnswerParts(expected);
  const actualParts = splitAnswerParts(actual);

  if (expectedParts.length > 1 || actualParts.length > 1) {
    if (expectedParts.length !== actualParts.length) return false;
    const remaining = [...actualParts];
    return expectedParts.every((part) => {
      const index = remaining.findIndex((candidate) => candidate === part);
      if (index === -1) return false;
      remaining.splice(index, 1);
      return true;
    });
  }

  return normalizeText(expected) === normalizeText(actual);
}

function splitAnswerParts(value: string): string[] {
  return value
    .split(/[\/／|｜;；\n\r]+/)
    .map(normalizeText)
    .filter(Boolean);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/____+/g, '')
    .replace(/[\s，。！？；：、“”‘’（）《》〈〉【】〔〕—…,.!?;:'"()[\]{}<>/\\|·\-]/g, '')
    .trim();
}
