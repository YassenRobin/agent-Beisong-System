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

const INTERNAL_DISPLAY_LABELS: Record<string, string> = {
  ...QUESTION_TYPE_LABELS,
  write_safe: '安全写入',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
  pending: '待处理',
  running: '进行中',
  win: '已通关',
  lose: '未通关',
  weak_point: '薄弱点',
  question_type: '题型',
  'snapshot.learning_context': '学习概况',
  'article.list_enabled': '可用文章',
  'question.agent_generate': '智能出题',
  'question.generate_for_articles': '按文章生成题目',
  'question.generate_for_weak_point': '薄弱点专项出题',
  'rogue.generate_and_save': '生成闯关副本',
  'wrong.review_queue': '错题复习队列',
  'favorite.recommend_questions': '推荐重点题目',
  'training.start_recommendation': '推荐普通训练',
  master: '学习统筹',
  planner: '学习规划',
  coach: '训练辅导',
  evaluator: '学习评估',
};

const TEXT_REPLACEMENTS: Record<string, string> = {
  ...INTERNAL_DISPLAY_LABELS,
  'Master Agent': '学习统筹',
  'Planner Agent': '学习规划',
  'Question Agent': '出题助手',
  'Coach Agent': '训练辅导',
  'Evaluator Agent': '学习评估',
  Provider: 'AI 服务',
  Rogue: '闯关',
  Agent: '学习助手',
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

export function safeUiLabel(value?: unknown, fallback = '未命名内容') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (INTERNAL_DISPLAY_LABELS[text]) return INTERNAL_DISPLAY_LABELS[text];
  if (/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/.test(text) || /^[a-z][a-z0-9_-]*$/.test(text)) {
    return fallback;
  }
  return text;
}

export function safeUiText(value?: unknown, fallback = '暂无说明') {
  let text = String(value ?? '').trim();
  if (!text) return fallback;
  Object.entries(TEXT_REPLACEMENTS)
    .sort(([a], [b]) => b.length - a.length)
    .forEach(([internalName, displayName]) => {
      if (/^[A-Za-z0-9_.-]+$/.test(internalName)) {
        const escapedName = internalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`(^|[^A-Za-z0-9_])${escapedName}(?=$|[^A-Za-z0-9_])`, 'g'), `$1${displayName}`);
      } else {
        text = text.split(internalName).join(displayName);
      }
    });
  text = text.replace(/\b[A-Za-z][A-Za-z0-9]*(?:[._][A-Za-z0-9_-]+)+\b/g, '系统功能');
  return text;
}

export function questionTypeListLabel(types?: string[]) {
  return (types || []).map(questionTypeLabel).join(' / ');
}
