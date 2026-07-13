import assert from 'node:assert/strict';
import { runQuestionAgent } from '../src-server/services/questionAgent';
import { runMasterAgent } from '../src-server/services/masterAgent';
import type { LearningAgentSnapshot } from '../src-server/services/learningAgent';

const snapshot: LearningAgentSnapshot = {
  texts: 3,
  questions: 1,
  articleIds: ['txt_1', 'txt_2', 'txt_3'],
  weakPoints: [
    { id: 'wp_1', title: '通假字', text_id: 'txt_1', accuracy: 0.35, wrong_count: 5, question_count: 1 },
  ],
  wrongItems: [],
  recentRuns: [],
  dungeons: [],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
};

async function main() {
  const weakPointRun = await runQuestionAgent({
    snapshot,
    goal: 'focus_weak_point',
    handlers: {
      'question.generate_for_weak_point': async (params: any) => ({
        created_count: params.count,
        weak_point_id: params.weak_point_id,
        route: '/weak-points',
      }),
    } as any,
  });

  assert.equal(weakPointRun.mode, 'deterministic');
  assert.equal(weakPointRun.tool_calls[0].tool, 'question.generate_for_weak_point');
  assert.equal(weakPointRun.result.created_count, 4);
  assert.equal(weakPointRun.result.generated_by, 'question_agent');

  const aiRun = await runQuestionAgent({
    snapshot,
    goal: 'fill_question_bank',
    askAi: async () => JSON.stringify({
      strategy: 'article',
      text_ids: ['txt_1', 'bad_txt'],
      count_per_text: 3,
      question_types: ['blank', 'bad_type'],
    }),
    handlers: {
      'question.generate_for_articles': async (params: any) => ({
        created_count: params.text_ids.length * params.count_per_text,
        text_ids: params.text_ids,
        route: '/questions',
      }),
    } as any,
  });

  assert.equal(aiRun.mode, 'ai');
  assert.equal(aiRun.tool_calls[0].tool, 'question.generate_for_articles');
  assert.deepEqual(aiRun.tool_calls[0].params.text_ids, ['txt_1']);
  assert.equal(aiRun.result.created_count, 3);

  const masterRun = await runMasterAgent({
    persist: false,
    snapshot,
    askAi: async () => JSON.stringify({
      tool_calls: [
        { tool: 'question.agent_generate', params: { goal: 'fill_question_bank' } },
      ],
    }),
    handlers: {
      'question.agent_generate': async () => ({ created_count: 6, generated_by: 'question_agent', route: '/questions' }),
    } as any,
  });

  assert.equal(masterRun.mode, 'ai');
  assert.equal(masterRun.steps[0].tool, 'question.agent_generate');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
