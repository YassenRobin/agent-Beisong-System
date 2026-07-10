import assert from 'node:assert/strict';
import {
  AGENT_TOOL_NAMES,
  buildFallbackQuestionsForArticle,
  executeAgentToolCalls,
  getAgentToolMetadata,
  normalizeAgentToolCall,
} from '../src-server/services/agentTools';

assert.deepEqual(AGENT_TOOL_NAMES, [
  'snapshot.learning_context',
  'article.list_enabled',
  'question.agent_generate',
  'question.generate_for_articles',
  'question.generate_for_weak_point',
  'rogue.generate_and_save',
  'wrong.review_queue',
  'favorite.recommend_questions',
  'training.start_recommendation',
]);

const metadata = getAgentToolMetadata();
assert.equal(metadata.length, AGENT_TOOL_NAMES.length);
assert.ok(metadata.every((item) => item.risk === 'read' || item.risk === 'write_safe'));
assert.ok(!metadata.some((item) => item.name.includes('delete')));
assert.ok(!metadata.some((item) => item.name.includes('provider')));

const questionAgentCall = normalizeAgentToolCall(
  { tool: 'question.agent_generate', params: { goal: 'focus_weak_point' } },
  { articleIds: ['txt_1'], weakPointIds: ['wp_1'], dungeonIds: [] },
);
assert.equal(questionAgentCall?.tool, 'question.agent_generate');
assert.equal(questionAgentCall?.risk, 'write_safe');
assert.deepEqual(questionAgentCall?.params, { goal: 'focus_weak_point' });

assert.equal(
  normalizeAgentToolCall(
    { tool: 'question.delete', params: {} },
    { articleIds: [], weakPointIds: [], dungeonIds: [] },
  ),
  null,
);
assert.equal(
  normalizeAgentToolCall(
    { tool: 'provider.activate', params: {} },
    { articleIds: [], weakPointIds: [], dungeonIds: [] },
  ),
  null,
);

const generated = normalizeAgentToolCall(
  {
    tool: 'question.generate_for_articles',
    params: {
      text_ids: ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5', 'txt_6'],
      count_per_text: 99,
      question_types: ['blank', 'context_recitation', 'bad_type'],
    },
  },
  { articleIds: ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5'], weakPointIds: ['wp_1'], dungeonIds: ['dg_1'] },
);

assert.deepEqual(generated?.params.text_ids, ['txt_1', 'txt_2', 'txt_3', 'txt_4', 'txt_5']);
assert.equal(generated?.params.count_per_text, 4);
assert.deepEqual(generated?.params.question_types, ['blank', 'context_recitation']);

const fallbackQuestions = buildFallbackQuestionsForArticle(
  {
    title: '赤壁赋',
    full_text: '清风徐来，水波不兴。诵明月之诗，歌窈窕之章。',
  },
  ['context_blank', 'pure_recitation'],
  4,
);
assert.equal(fallbackQuestions.length, 4);
assert.ok(fallbackQuestions.some((item) => item.type === 'context_blank' && item.prompt.includes('____')));
assert.ok(fallbackQuestions.some((item) => item.type === 'pure_recitation' && item.answer.length > 0));
assert.ok(fallbackQuestions.every((item) => item.prompt && item.answer && item.prompt !== item.answer));

assert.equal(
  normalizeAgentToolCall(
    {
      tool: 'question.generate_for_weak_point',
      params: { weak_point_id: 'missing', count: 99 },
    },
    { articleIds: ['txt_1'], weakPointIds: ['wp_1'], dungeonIds: [] },
  ),
  null,
);

async function main() {
  const calls: any[] = [
    { tool: 'wrong.review_queue', risk: 'read', params: {} },
    {
      tool: 'question.generate_for_articles',
      risk: 'write_safe',
      params: { text_ids: ['txt_1'], count_per_text: 1, question_types: ['blank'] },
    },
  ];
  const executed: string[] = [];
  const results = await executeAgentToolCalls(calls, {
    handlers: {
      'wrong.review_queue': async () => {
        executed.push('wrong.review_queue');
        return { route: '/wrong', count: 2 };
      },
      'question.generate_for_articles': async () => {
        executed.push('question.generate_for_articles');
        return { route: '/questions', created: 1 };
      },
    } as any,
  });

  assert.deepEqual(executed, ['wrong.review_queue', 'question.generate_for_articles']);
  assert.equal(results[0].status, 'completed');
  assert.equal(results[1].status, 'completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
