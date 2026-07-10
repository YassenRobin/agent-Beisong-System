import assert from 'node:assert/strict';
import { runMasterAgent } from '../src-server/services/masterAgent';
import type { LearningAgentSnapshot } from '../src-server/services/learningAgent';

const snapshot: LearningAgentSnapshot = {
  texts: 2,
  questions: 1,
  articleIds: ['txt_1', 'txt_2'],
  weakPoints: [
    { id: 'wp_1', title: '通假字', text_id: 'txt_1', accuracy: 0.4, wrong_count: 4, question_count: 2 },
  ],
  wrongItems: [
    { id: 'wi_1', text_id: 'txt_1', question_id: 'q_1', error_type: 'meaning', count: 2 },
  ],
  recentRuns: [],
  dungeons: [],
  activeProvider: { id: 'ap_1', name: 'MiniMax', provider_type: 'minimax' },
};

async function main() {
  const deterministicExecuted: string[] = [];
  const badJsonRun = await runMasterAgent({
    snapshot,
    askAi: async () => 'not json at all',
    handlers: {
      'question.agent_generate': async (params: any) => {
        deterministicExecuted.push(`question.agent_generate:${params.goal}`);
        return { created_count: 2, generated_by: 'question_agent', route: '/questions' };
      },
      'wrong.review_queue': async () => {
        deterministicExecuted.push('wrong.review_queue');
        return { items: [{ id: 'wi_1' }], route: '/wrong' };
      },
    } as any,
  });

  assert.equal(badJsonRun.mode, 'deterministic');
  assert.notEqual(badJsonRun.summary, 'AI 返回计划不可用，已切换为规则建议。');
  assert.ok(deterministicExecuted.includes('question.agent_generate:fill_question_bank'));
  assert.equal(badJsonRun.steps[0].status, 'completed');

  const aiExecuted: string[] = [];
  const aiRun = await runMasterAgent({
    snapshot,
    askAi: async () => JSON.stringify({
      tool_calls: [
        {
          tool: 'question.agent_generate',
          params: { goal: 'fill_question_bank' },
        },
      ],
    }),
    handlers: {
      'question.agent_generate': async (params: any) => {
        aiExecuted.push(params.goal);
        return { created_count: 3, generated_by: 'question_agent', route: '/questions' };
      },
    } as any,
  });

  assert.equal(aiRun.mode, 'ai');
  assert.deepEqual(aiExecuted, ['fill_question_bank']);
  assert.equal(aiRun.steps[0].tool, 'question.agent_generate');

  const dangerousRun = await runMasterAgent({
    snapshot,
    askAi: async () => JSON.stringify({ tool_calls: [{ tool: 'question.delete', params: { id: 'q_1' } }] }),
    handlers: {
      'question.agent_generate': async () => ({ created_count: 1, generated_by: 'question_agent', route: '/questions' }),
    } as any,
  });

  assert.equal(dangerousRun.mode, 'deterministic');
  assert.ok(!dangerousRun.steps.some((step) => String(step.tool) === 'question.delete'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
