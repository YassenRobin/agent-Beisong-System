export type ImageryTermSource = 'target' | 'builtin' | 'teacher' | 'ai';

export type ImagerySearchTerm = {
  term: string;
  sources: ImageryTermSource[];
};

const LEXICON: Record<string, string[]> = {
  风: ['东风', '西风', '北风', '南风', '清风', '朔风', '长风', '春风', '秋风'],
  月: ['明月', '月光', '月色', '婵娟', '玉盘'],
  雨: ['细雨', '夜雨', '春雨', '秋雨', '暮雨', '烟雨'],
  雪: ['飞雪', '暮雪', '白雪', '冰雪'],
  云: ['白云', '孤云', '浮云', '暮云', '云霞'],
  山: ['青山', '空山', '远山', '群山'],
  水: ['流水', '江水', '河水', '秋水', '春水'],
  江: ['江水', '江流', '长江', '大江'],
  海: ['沧海', '海水', '海日'],
  日: ['落日', '夕阳', '斜阳', '残阳', '朝日'],
  花: ['落花', '春花', '桃花', '梅花', '菊花', '荷花'],
  柳: ['杨柳', '垂柳', '柳色', '柳絮'],
  鸟: ['飞鸟', '归鸟', '孤鸟', '啼鸟'],
  雁: ['鸿雁', '归雁', '孤雁', '雁字'],
  猿: ['猿啼', '猿声', '猿鸣'],
  舟: ['孤舟', '扁舟', '归舟', '兰舟'],
  酒: ['美酒', '浊酒', '清酒', '杯酒'],
  笛: ['笛声', '羌笛', '横笛'],
  钟: ['钟声', '暮钟', '疏钟'],
  梧桐: [],
  秋: ['秋风', '秋雨', '秋月', '秋霜', '秋水'],
  春: ['春风', '春雨', '春水', '春花', '春草'],
  霜: ['秋霜', '白霜', '霜雪'],
  露: ['白露', '清露', '寒露'],
};

const ABSTRACT_COMPOUNDS: Record<string, string[]> = {
  风: ['风骨', '风格', '风俗', '文风', '学风', '作风', '风气', '风尚', '风流', '国风', '风波', '风尘', '移风易俗'],
  月: ['岁月', '年月', '月份', '月日'],
  秋: ['千秋'],
  春: ['青春'],
};

export function buildImagerySearchTerms(
  theme: string,
  teacherTerms: string[] = [],
  aiTerms: string[] = [],
): ImagerySearchTerm[] {
  const entries = new Map<string, Set<ImageryTermSource>>();
  addTerms(entries, [theme], 'target');
  addTerms(entries, LEXICON[theme] || [], 'builtin');
  addTerms(entries, teacherTerms, 'teacher');
  addTerms(entries, aiTerms.filter((term) => theme.length <= 1 || String(term).trim().length > 1), 'ai');
  return [...entries.entries()]
    .map(([term, sources]) => ({ term, sources: [...sources] }))
    .slice(0, 20);
}

/** 仅在命中词的每一次出现都属于已知抽象复合词时，才做规则排除。 */
export function isRuleExcludedMatch(sentence: string, theme: string, matchedTerms: string[]): boolean {
  const compounds = ABSTRACT_COMPOUNDS[theme] || [];
  if (compounds.length === 0) return false;
  return matchedTerms.every((term) => {
    if (term !== theme) return false;
    const positions = findAllIndexes(sentence, term);
    return positions.length > 0 && positions.every((position) => compounds.some((compound) => {
      const start = sentence.lastIndexOf(compound, position);
      return start >= 0 && position >= start && position < start + compound.length;
    }));
  });
}

function addTerms(
  entries: Map<string, Set<ImageryTermSource>>,
  terms: string[],
  source: ImageryTermSource,
) {
  for (const raw of terms) {
    const term = String(raw || '').trim();
    if (!term) continue;
    const sources = entries.get(term) || new Set<ImageryTermSource>();
    sources.add(source);
    entries.set(term, sources);
  }
}

function findAllIndexes(text: string, term: string): number[] {
  const indexes: number[] = [];
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(term, from);
    if (index < 0) break;
    indexes.push(index);
    from = index + Math.max(1, term.length);
  }
  return indexes;
}
