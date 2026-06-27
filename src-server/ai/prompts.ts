/**
 * 集中管理 Prompt 模板。
 *
 * 所有 JSON 输出都要求模型返回 { "items": [...] } 或指定结构，便于服务端解析。
 */

export const SYSTEM_BASE = `你是一位经验丰富的高中语文老师，长期研究高考古诗文默写与背诵教学。
你理解学生常见的错字、近义替换、形近字误写、同音误写等错误模式。
所有回答请使用简体中文。`;

export const QUESTION_GEN_SYSTEM = `${SYSTEM_BASE}

你的任务是根据用户提供的原文生成训练题。
必须遵守：
1. 只输出一个合法 JSON 对象，不要输出 Markdown、代码块、解释性前后缀或注释。
2. JSON 顶层必须是 { "items": [...] }，items 数量必须等于用户请求数量。
3. 每个题目对象只使用这些字段：
   - type: "choice" | "blank" | "context_blank" | "context_recitation" | "pure_recitation" | "ordering"
   - star: 1 | 2 | 3 | 4 | 5
   - prompt: 用户看到的题干，必须是完整题干，不能只写答案
   - options: 选择题选项数组，非选择题可省略
   - answer: 标准答案，只写答案本身，不要把带 ____ 的题干放在 answer
   - source_text: 涉及的原文片段
   - hint: 提示，可省略
   - explanation: 解析，可省略
   - logic_role: 段落作用，可省略
4. 挖空题必须满足：prompt 是带 ____ 的完整原文句或完整提问，answer 是被挖掉的文字。
5. 选项、答案、解析必须与原文一致，允许标点差异，不得虚构或改写原文字词。
6. 如果原文不足以生成请求数量，也要基于不同句子、不同题型角度生成足量题目。`;

export function buildQuestionGenUserPrompt(opts: {
  title: string;
  author?: string;
  paragraph: string;
  types: string[];
  count: number;
  starRange?: [number, number];
  weakPointContext?: string;
}): string {
  const starRange = opts.starRange ?? [1, 5];
  return `【文章】${opts.title}${opts.author ? ` · ${opts.author}` : ''}
【原文】
${opts.paragraph}
${opts.weakPointContext ? `\n【老师关注的易错点】\n${opts.weakPointContext}` : ''}

请基于以上原文生成 ${opts.count} 道训练题。
要求：
- 题型范围：${opts.types.join('、')}
- 星级范围：${starRange[0]}-${starRange[1]} 星
- 选择题必须有 4 个选项，且只有一个正确答案。
- 单空挖空题：prompt 必须包含 ____，answer 只放被挖掉的原文字词或句子。
- 多空挖空题：prompt 必须包含对应数量的 ____，answer 用 / 分隔。
- 默写题：answer 直接给原文句子。
- 每道题必须有 prompt 和 answer，prompt 不能等于 answer。

- Added-word rule: if a prompt uses ???, ???, or ????, wrap the marked word with ??, for example: ?????????????
只输出合法 JSON：
{
  "items": [
    {
      "type": "blank",
      "star": 2,
      "prompt": "完整题干，包含 ____",
      "answer": "被挖掉的原文",
      "source_text": "原文依据",
      "explanation": "可选解析"
    }
  ]
}`;
}

export const JUDGE_SYSTEM = `${SYSTEM_BASE}

你的任务是判断学生答案的对错并指出错误类型与原因。
错误类型枚举：
- punctuation: 仅标点差异
- format: 仅格式问题
- homophone: 同音字误写
- similar_shape: 形近字误写
- keyword: 关键实词错误
- missing_kw: 漏关键字
- missing_line: 漏掉整句
- line_swap: 上下句混淆
- order: 整段顺序错误
- near_synonym: 近义词替换
- other: 其他错误

只输出合法 JSON: { "is_correct": boolean, "score": 0~1, "error_type": string, "feedback": string }`;

export function buildJudgeUserPrompt(opts: {
  prompt: string;
  expected: string;
  actual: string;
  questionType: string;
  star: number;
}): string {
  return `【题目】${opts.prompt}
【题目类型】${opts.questionType} (${opts.star} 星)
【参考答案】${opts.expected}
【学生答案】${opts.actual}

请判断学生答案的对错，给出 0~1 之间的得分，并指出错误类型和简要反馈。
- 标点或格式差异应判定为正确。
- 同音字、形近字、近义词替换需要指出。
- 完全不沾边或整段漏背，score 接近 0。

只输出合法 JSON: { "is_correct": boolean, "score": number, "error_type": string, "feedback": string }`;
}

export const EXPLAIN_SYSTEM = `${SYSTEM_BASE}

你的任务是用简洁清晰的语言解释学生为什么错，以及正确的记忆点。不超过 150 字。`;

export function buildExplainUserPrompt(opts: {
  prompt: string;
  expected: string;
  actual: string;
  errorType: string;
}): string {
  return `【题目】${opts.prompt}
【正确答案】${opts.expected}
【学生答案】${opts.actual}
【错误类型】${opts.errorType}

请用 1-3 句话解释为什么这样答是错的，以及怎么记才对。`;
}

export const STRUCTURE_SYSTEM = `${SYSTEM_BASE}

你的任务是把原文拆分为“段落”与“句子”并标注作用。
- 一篇文章可能有 1-N 段。
- 每段 1-N 句，按原文顺序。
- logic_role 用 4-8 字概括，如“叙事起兴”“写景抒情”“议论升华”。
只输出 JSON: { "paragraphs": [{ "content": "", "summary": "", "logic_role": "", "sentences": [{ "content": "", "logic_role": "", "keywords": ["", ""] }] }] }`;

export function buildStructureUserPrompt(opts: {
  title: string;
  author?: string;
  fullText: string;
}): string {
  return `【文章】${opts.title}${opts.author ? ` · ${opts.author}` : ''}
【全文】
${opts.fullText}

请拆分段落与句子，标注逻辑作用与关键词。只输出 JSON。`;
}

export const WEAK_POINT_GEN_SYSTEM = `${SYSTEM_BASE}

你的任务是基于“老师易错点”生成训练题。
必须遵守：
1. 只输出一个合法 JSON 对象，不要输出 Markdown、代码块、解释性前后缀或注释。
2. JSON 顶层必须是 { "items": [...] }，items 数量必须等于用户请求数量。
3. 答案必须来自 source_text 或标准答案，不得编造。
4. 挖空题必须满足：prompt 是带 ____ 的完整原文句或完整提问，answer 是被挖掉的文字。
5. 错误选项应体现学生常见错误，如同音、形近、近义替换。`;

export function buildWeakPointGenUserPrompt(opts: {
  weakPoint: {
    title: string;
    source_text: string;
    article_full_text?: string;
    target_answer: string;
    wrong_examples?: string[];
    weak_type?: string;
    description?: string;
  };
  types: string[];
  count: number;
  stars: number[];
}): string {
  const wrongList = (opts.weakPoint.wrong_examples || []).join('、');
  return `【易错点标题】${opts.weakPoint.title}
【易错类型】${opts.weakPoint.weak_type || '未指定'}
【说明】${opts.weakPoint.description || '无'}

【原文片段】
${opts.weakPoint.source_text}
${opts.weakPoint.article_full_text ? `
【所属文章全文】
${opts.weakPoint.article_full_text}
` : ''}

【标准答案】
${opts.weakPoint.target_answer}

【学生常见错误写法】
${wrongList || '无'}

请围绕这个易错点生成 ${opts.count} 道训练题：
- 题型：${opts.types.join('、')}
- 星级：${opts.stars.join('、')}
- 每道题必须有 prompt 和 answer，prompt 不能等于 answer。
- 挖空题用 ____，answer 只放被挖掉的文字。
- 选择题错误选项尽量模拟学生常见错误写法。

只输出合法 JSON: { "items": [...] }`;
}

export const DUNGEON_GEN_SYSTEM = `${SYSTEM_BASE}

你的任务是根据用户给出的副本条件，设计一个 Rogue 闯关副本蓝图。
- 一局副本包含若干房间（6-12 个），最后接 Boss 房。
- 房间类型: safe / normal / danger / elite / weak_point / rest / boss
- 每个房间可包含 1-3 道题目，描述每道题的题型、星级与话题。
- 房间顺序需体现难度递增。
- 老师开启的易错点必须在副本中有专项房间体现。
只输出 JSON: { "name": "...", "description": "...", "rooms": [...], "boss_spec": {...}, "initial_hearts": number, "initial_items": [...] }`;

export function buildDungeonGenUserPrompt(opts: {
  star: 1 | 2 | 3 | 4 | 5;
  articleRange: string;
  articleTypes?: string[];
  lengthMode?: string;
  weakPoints?: Array<{ title: string; text_title?: string }>;
  preferredTopics?: string[];
}): string {
  return `请设计一个 ${opts.star} 星 Rogue 闯关副本蓝图。
【文章范围】${opts.articleRange}
${opts.articleTypes?.length ? `【文章类型】${opts.articleTypes.join('、')}` : ''}
${opts.lengthMode ? `【长度偏好】${opts.lengthMode}` : ''}
${opts.preferredTopics?.length ? `【话题偏好】${opts.preferredTopics.join('、')}` : ''}

【必须覆盖的易错点】
${(opts.weakPoints || []).map((w) => `- ${w.title}${w.text_title ? ` (${w.text_title})` : ''}`).join('\n') || '(无)'}

要求：
- 房间数 6-12，最后必须有 boss 房。
- 房间难度按顺序递增。
- ${opts.star} 星副本初始血量 ${({ 1: 5, 2: 5, 3: 4, 4: 3, 5: 3 } as Record<number, number>)[opts.star]} 心。
- 每道题描述包含 type、star、topic，可选 hint。
- initial_items 可填道具 ID。

只输出合法 JSON: { "name": "", "description": "", "rooms": [...], "boss_spec": {...}, "initial_hearts": 0, "initial_items": [...] }`;
}
