export const QUESTION_TYPE_LABELS: Record<string, string> = {
  choice: '选择题',
  blank: '挖空题',
  context_blank: '文脉挖空',
  context_recitation: '文脉默写',
  pure_recitation: '纯默写',
  ordering: '排序题',
};

export const ERROR_TYPE_LABELS: Record<string, string> = {
  punctuation: '标点差异',
  format: '格式差异',
  other: '答案不一致',
  homophone: '同音误写',
  similar_shape: '形近字误写',
  keyword: '关键词错误',
  missing_kw: '漏关键词',
  missing: '漏字漏句',
  missing_line: '漏句',
  line_swap: '上下句混淆',
  extra: '多字多句',
  order: '顺序错误',
  near_synonym: '近义替换',
  near_synonym_replacement: '近义替换',
  meaning: '意义理解错误',
  typo: '错别字',
};

export const WEAK_TYPE_LABELS: Record<string, string> = {
  near_synonym_replacement: '近义替换',
  near_synonym: '近义替换',
  homophone: '同音误写',
  similar_shape: '形近字误写',
  keyword: '关键词错误',
  missing_line: '漏句',
  line_swap: '上下句混淆',
  order: '顺序错乱',
  other: '其他',
};

export const ROOM_TYPE_LABELS: Record<string, string> = {
  safe: '安全房',
  normal: '普通房',
  danger: '危险房',
  elite: '精英房',
  weak_point: '易错点房',
  rest: '休息房',
  boss: 'Boss 房',
};

export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  poetry: '诗词',
  prose: '文言文',
  ancient_poetry: '古诗',
  ancient_prose: '古文',
  essay: '散文',
  ci: '词',
  fu: '赋',
  ji: '记',
  lun: '论',
};

export function questionTypeLabel(type?: string) {
  return QUESTION_TYPE_LABELS[type || ''] || '未知题型';
}

export function errorTypeLabel(type?: string) {
  return ERROR_TYPE_LABELS[type || 'other'] || '其他错误';
}

export function weakTypeLabel(type?: string) {
  return WEAK_TYPE_LABELS[type || 'other'] || '其他';
}

export function roomTypeLabel(type?: string) {
  return ROOM_TYPE_LABELS[type || ''] || '未知房间';
}

export function articleTypeLabel(type?: string) {
  const value = String(type || '').trim();
  if (!value) return '未分类';
  if (ARTICLE_TYPE_LABELS[value]) return ARTICLE_TYPE_LABELS[value];
  return /^[A-Za-z0-9_-]+$/.test(value) ? '未分类' : value;
}

export function questionTypeListLabel(types?: string[]) {
  return (types || []).map(questionTypeLabel).join(' / ');
}
