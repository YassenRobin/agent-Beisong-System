export type ReciteCategory = 'poetry' | 'prose';

export type ReciteUnit = {
  id: string;
  text: string;
};

export type ReciteParagraph = {
  id: string;
  title: string;
  text: string;
  units: ReciteUnit[];
};

export type ReciteArticleLike = {
  title?: string;
  author?: string;
  type?: string;
  length_type?: string;
  full_text?: string;
};

export function inferReciteCategory(article: ReciteArticleLike): ReciteCategory {
  const type = String(article.type || '').toLowerCase();
  const title = String(article.title || '').toLowerCase();
  const lengthType = String(article.length_type || '').toLowerCase();
  const value = `${type} ${title}`;

  if (/(诗|词|曲|诗词|古诗|poem|poetry|ci)/i.test(value)) return 'poetry';
  if (/(文言|古文|散文|赋|序|表|论|说|记|传|prose)/i.test(value)) return 'prose';
  return lengthType === 'short' ? 'poetry' : 'prose';
}

export function createPracticeParagraphs(fullText: string, category: ReciteCategory): ReciteParagraph[] {
  if (category === 'poetry') return [createWholeTextParagraph(fullText)];
  return splitRecitationParagraphs(fullText);
}

export function createWholeTextParagraph(fullText: string): ReciteParagraph {
  const text = cleanText(fullText);
  const units = splitRecitationUnits(text);
  return {
    id: 'whole_text',
    title: '全文',
    text,
    units: units.length ? units : [{ id: 'whole_text_u_1', text }],
  };
}

export function splitRecitationParagraphs(fullText: string): ReciteParagraph[] {
  const blocks = cleanText(fullText)
    .split(/\n\s*\n|\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const fallback = blocks.length ? blocks : [cleanText(fullText)].filter(Boolean);
  return fallback.map((text, index) => {
    const units = splitRecitationUnits(text).map((unit, unitIndex) => ({
      id: `p_${index + 1}_u_${unitIndex + 1}`,
      text: unit.text,
    }));
    return {
      id: `p_${index + 1}`,
      title: `第 ${index + 1} 段`,
      text,
      units: units.length ? units : [{ id: `p_${index + 1}_u_1`, text }],
    };
  });
}

export function splitRecitationUnits(fullText: string): ReciteUnit[] {
  const text = cleanText(fullText);
  const chunks = text
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  return chunks.map((part, index) => ({ id: `unit_${index + 1}`, text: part }));
}

export function maskTextByLevel(text: string, level: 1 | 2 | 3): string {
  const chars = Array.from(String(text || ''));
  const interval = level === 1 ? 5 : level === 2 ? 3 : 2;
  return chars.map((char, index) => {
    if (isPunctuationOrSpace(char)) return char;
    return index % interval === 0 ? '＿' : char;
  }).join('');
}

export function normalizeRecitationText(text: string): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\s＿，。！？；：、,.!?;:'"“”‘’（）()《》<>[\]{}]/g, '')
    .trim();
}

export function isRecitationMatch(expected: string, actual: string): boolean {
  return normalizeRecitationText(expected) === normalizeRecitationText(actual);
}

export function makeDeterministicShuffle<T>(items: T[]): T[] {
  if (items.length <= 2) return [...items].reverse();
  const evens = items.filter((_, index) => index % 2 === 0);
  const odds = items.filter((_, index) => index % 2 === 1);
  return [...odds.reverse(), ...evens.reverse()];
}

function cleanText(text: string): string {
  return String(text || '').replace(/\r/g, '').trim();
}

function isPunctuationOrSpace(char: string): boolean {
  return /[\s＿，。！？；：、,.!?;:'"“”‘’（）()《》<>[\]{}]/.test(char);
}
