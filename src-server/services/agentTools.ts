import * as article from './article';
import * as question from './question';
import * as weakPoint from './weakPoint';
import * as wrongItem from './wrongItem';
import * as rogue from './rogue';
import * as stats from './stats';
import * as training from './training';
import { generateQuestions, generateQuestionsByWeakPoint } from '../ai/service';
import type { GeneratedQuestion, QuestionType } from '../ai/types';

export type AgentToolRisk = 'read' | 'write_safe';

export type AgentToolName =
  | 'snapshot.learning_context'
  | 'article.list_enabled'
  | 'question.agent_generate'
  | 'question.generate_for_articles'
  | 'question.generate_for_weak_point'
  | 'rogue.generate_and_save'
  | 'wrong.review_queue'
  | 'favorite.recommend_questions'
  | 'training.start_recommendation';

export type AgentToolCall = {
  tool: AgentToolName;
  params: Record<string, unknown>;
  risk: AgentToolRisk;
};

export type AgentToolMetadata = {
  name: AgentToolName;
  risk: AgentToolRisk;
};

export type AgentToolExecutionResult = {
  tool: AgentToolName;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
};

export type AgentToolHandlers = Partial<Record<AgentToolName, (params: Record<string, unknown>) => Promise<unknown> | unknown>>;

export const AGENT_TOOL_NAMES: AgentToolName[] = [
  'snapshot.learning_context',
  'article.list_enabled',
  'question.agent_generate',
  'question.generate_for_articles',
  'question.generate_for_weak_point',
  'rogue.generate_and_save',
  'wrong.review_queue',
  'favorite.recommend_questions',
  'training.start_recommendation',
];

const WRITE_SAFE_TOOLS = new Set<AgentToolName>([
  'question.generate_for_articles',
  'question.agent_generate',
  'question.generate_for_weak_point',
  'rogue.generate_and_save',
]);

const ALLOWED_QUESTION_TYPES = new Set([
  'choice',
  'blank',
  'context_blank',
  'context_recitation',
  'pure_recitation',
  'ordering',
]);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeIdList(value: unknown, allowedIds: string[], max: number): string[] {
  const allowed = new Set(allowedIds);
  const ids = Array.isArray(value) ? value.map(String).map((item) => item.trim()) : [];
  return ids
    .filter((id, index, all) => id && allowed.has(id) && all.indexOf(id) === index)
    .slice(0, max);
}

function normalizeQuestionTypes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String).map((item) => item.trim()) : [];
  const normalized = raw
    .filter((item, index, all) => ALLOWED_QUESTION_TYPES.has(item) && all.indexOf(item) === index)
    .slice(0, 4);
  return normalized.length ? normalized : ['blank', 'context_recitation'];
}

function splitArticleSentences(fullText: string): string[] {
  const matches = String(fullText || '').match(/[^。！？!?\n]+[。！？!?]?/g) || [];
  const sentences = matches.map((item) => item.trim()).filter((item) => item.length >= 4);
  return sentences.length ? sentences : [String(fullText || '').trim()].filter(Boolean);
}

function pickAnswerText(sentence: string): string {
  const cleaned = sentence.replace(/[。！？!?，,；;：:\s]/g, '');
  if (cleaned.length <= 6) return cleaned || sentence;
  return cleaned.slice(Math.max(0, Math.floor(cleaned.length / 2) - 2), Math.max(4, Math.floor(cleaned.length / 2) + 2));
}

export function buildFallbackQuestionsForArticle(
  text: { title: string; full_text: string },
  questionTypes: string[] = ['blank', 'context_recitation'],
  count = 2,
): GeneratedQuestion[] {
  const sentences = splitArticleSentences(text.full_text);
  const types = questionTypes.length ? questionTypes : ['blank', 'context_recitation'];
  const items: GeneratedQuestion[] = [];

  for (let index = 0; index < Math.max(1, count); index++) {
    const sentence = sentences[index % sentences.length] || text.full_text;
    const rawType = types[index % types.length] as QuestionType;
    const type = rawType === 'choice' || rawType === 'ordering' ? 'blank' : rawType;
    const answer = type === 'blank' || type === 'context_blank'
      ? pickAnswerText(sentence)
      : sentence;
    const prompt = type === 'blank' || type === 'context_blank'
      ? sentence.replace(answer, '____')
      : `请默写《${text.title}》中的相关句子。`;

    items.push({
      type,
      star: 2,
      prompt: prompt.includes('____') ? prompt : `${sentence}\n请填写空缺处：____`,
      answer,
      source_text: sentence,
      explanation: 'AI 输出无法解析时由系统根据原文生成的保底练习题。',
    });
  }

  return items;
}

export function getAgentToolMetadata(): AgentToolMetadata[] {
  return AGENT_TOOL_NAMES.map((name) => ({
    name,
    risk: WRITE_SAFE_TOOLS.has(name) ? 'write_safe' : 'read',
  }));
}

export function normalizeAgentToolCall(
  raw: unknown,
  ctx: { articleIds: string[]; weakPointIds: string[]; dungeonIds: string[] },
): AgentToolCall | null {
  const obj = raw && typeof raw === 'object' ? raw as any : {};
  const tool = String(obj.tool || obj.name || '').trim() as AgentToolName;
  if (!AGENT_TOOL_NAMES.includes(tool)) return null;

  const params = obj.params && typeof obj.params === 'object'
    ? obj.params as Record<string, unknown>
    : {};
  const metadata = getAgentToolMetadata().find((item) => item.name === tool);
  if (!metadata) return null;

  if (tool === 'question.generate_for_articles') {
    const textIds = normalizeIdList(params.text_ids || params.textIds || params.article_ids || params.articleIds, ctx.articleIds, 5);
    if (!textIds.length) return null;
    return {
      tool,
      risk: metadata.risk,
      params: {
        text_ids: textIds,
        count_per_text: clampInt(params.count_per_text || params.countPerText || params.count, 1, 4, 2),
        question_types: normalizeQuestionTypes(params.question_types || params.questionTypes || params.types),
      },
    };
  }

  if (tool === 'question.agent_generate') {
    const goal = String(params.goal || params.intent || '').trim();
    return {
      tool,
      risk: metadata.risk,
      params: {
        goal: goal || 'fill_question_bank',
      },
    };
  }

  if (tool === 'question.generate_for_weak_point') {
    const weakPointId = String(params.weak_point_id || params.weakPointId || '').trim();
    if (!weakPointId || !ctx.weakPointIds.includes(weakPointId)) return null;
    return {
      tool,
      risk: metadata.risk,
      params: {
        weak_point_id: weakPointId,
        count: clampInt(params.count, 1, 8, 4),
        question_types: normalizeQuestionTypes(params.question_types || params.questionTypes || params.types),
      },
    };
  }

  return { tool, params: {}, risk: metadata.risk };
}

function createDefaultAgentToolHandlers(): AgentToolHandlers {
  return {
    'snapshot.learning_context': () => ({
      summary: stats.dashboardSummary(),
      recent_runs: stats.recentRuns(5),
      route: '/agent',
    }),
    'article.list_enabled': () => ({
      articles: article.listTexts({ enabled: 1 }).map((item) => ({
        id: item.id,
        title: item.title,
        author: item.author,
        type: item.type,
        length: item.full_text.length,
      })),
      route: '/articles',
    }),
    'question.agent_generate': async (params) => {
      const [{ getLearningAgentPlan }, { runQuestionAgent }] = await Promise.all([
        import('./learningAgent'),
        import('./questionAgent'),
      ]);
      const run = await runQuestionAgent({
        snapshot: getLearningAgentPlan().snapshot,
        goal: String(params.goal || 'fill_question_bank'),
      });
      return {
        ...run.result,
        mode: run.mode,
        goal: run.goal,
        tool_calls: run.tool_calls,
        route: run.result.route,
      };
    },
    'question.generate_for_articles': async (params) => {
      const textIds = params.text_ids as string[];
      const countPerText = Number(params.count_per_text || 2);
      const questionTypes = params.question_types as string[];
      const created: Array<{ text_id: string; question_ids: string[] }> = [];
      const fallbacks: Array<{ text_id: string; reason: string; count: number }> = [];

      for (const textId of textIds) {
        const text = article.getText(textId);
        if (!text) continue;
        let items: GeneratedQuestion[] = [];
        try {
          items = await generateQuestions({
            title: text.title,
            author: text.author,
            paragraph: text.full_text.slice(0, 1800),
            types: questionTypes as any,
            count: countPerText,
            starRange: [1, 4],
          });
        } catch (err: any) {
          items = buildFallbackQuestionsForArticle(text, questionTypes, countPerText);
          fallbacks.push({
            text_id: text.id,
            reason: err?.message || String(err),
            count: items.length,
          });
        }
        const records = question.bulkCreateQuestions(items, { text_id: text.id, created_by: 'ai_agent' });
        created.push({ text_id: text.id, question_ids: records.map((item) => item.id) });
      }

      return {
        created_count: created.reduce((sum, item) => sum + item.question_ids.length, 0),
        fallback_count: fallbacks.reduce((sum, item) => sum + item.count, 0),
        fallbacks,
        created,
        route: '/questions',
      };
    },
    'question.generate_for_weak_point': async (params) => {
      const weakPointId = String(params.weak_point_id || '');
      const wp = weakPoint.getWeakPoint(weakPointId);
      if (!wp) throw new Error('Weak point does not exist.');
      const text = article.getText(wp.text_id);
      if (!text) throw new Error('Weak point article does not exist.');
      const items = await generateQuestionsByWeakPoint({
        weakPoint: {
          title: wp.title,
          source_text: wp.source_text,
          article_full_text: text.full_text,
          target_answer: wp.target_answer,
          wrong_examples: wp.wrong_examples,
          weak_type: wp.weak_type,
          description: wp.description,
        },
        types: (params.question_types as any) || ['blank', 'context_recitation'],
        count: Number(params.count || 4),
        stars: [1, 2, 3, 4],
      });
      const records = question.bulkCreateQuestions(items, { text_id: wp.text_id, paragraph_id: wp.paragraph_id, created_by: 'ai_agent_weak_point' });
      for (const record of records) {
        weakPoint.linkWeakPointQuestion(weakPointId, record.id);
      }
      return {
        weak_point_id: weakPointId,
        created_count: records.length,
        question_ids: records.map((item) => item.id),
        route: '/weak-points',
      };
    },
    'rogue.generate_and_save': async (params) => {
      const star = clampInt(params.star, 1, 5, 2) as 1 | 2 | 3 | 4 | 5;
      const result = await rogue.generateDungeon({
        star,
        article_range: 'all',
        length_mode: 'short',
        dungeon_length: 'short',
        preferred_question_types: ['blank', 'context_recitation'],
        prefer_wrong_items: true,
        prefer_enabled_weak_points: true,
        allow_ai_generate_questions: true,
        ai_assist: true,
      });
      const id = rogue.saveDungeon(result.dungeon, false, 'generated');
      return {
        dungeon_id: id,
        generated_question_ids: result.generated_question_ids || [],
        route: `/rogue/${id}`,
      };
    },
    'wrong.review_queue': () => ({
      items: wrongItem.listWrongItems({ status: 'active' }).slice(0, 20),
      route: '/wrong',
    }),
    'favorite.recommend_questions': () => ({
      questions: question.listQuestions({ enabled: 1 }).slice(0, 20).map((item) => ({
        id: item.id,
        text_id: item.text_id,
        type: item.type,
        star: item.star,
        prompt: item.prompt,
      })),
      route: '/favorites',
    }),
    'training.start_recommendation': () => ({
      ...training.getTrainingRecommendation({ limit: 10 }),
      route: '/train',
    }),
  };
}

export async function executeAgentToolCalls(
  calls: AgentToolCall[],
  opts: { handlers?: AgentToolHandlers } = {},
): Promise<AgentToolExecutionResult[]> {
  const handlers = opts.handlers || createDefaultAgentToolHandlers();
  const results: AgentToolExecutionResult[] = [];

  for (const call of calls) {
    const handler = handlers[call.tool];
    if (!handler) {
      results.push({ tool: call.tool, status: 'skipped', error: 'Tool handler is not available.' });
      continue;
    }

    try {
      results.push({ tool: call.tool, status: 'completed', result: await handler(call.params) });
    } catch (err: any) {
      results.push({ tool: call.tool, status: 'failed', error: err?.message || String(err) });
      if (call.risk === 'write_safe') break;
    }
  }

  return results;
}
