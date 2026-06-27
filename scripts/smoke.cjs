// scripts/smoke.cjs — 不启动 Electron,只验证后端逻辑
const path = require('node:path');
const fs = require('node:fs');

// 切到 src-server dist 目录读取编译产物
process.chdir(path.resolve(__dirname, '..'));

// 用 ts-node-style: 直接编译后 import
require('child_process').execSync('npx tsc -p electron/tsconfig.json', { stdio: 'inherit' });

(async () => {
  const dbDir = path.join(__dirname, '..', '.tmp-smoke');
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'smoke.db');
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(dbPath + '-journal', { force: true });
  fs.rmSync(dbPath + '-wal', { force: true });

  const { initDatabase, getDb, uid, nowIso } = require('../dist-electron/src-server/db');
  initDatabase(dbPath);
  console.log('[OK] 数据库初始化:', dbPath);

  const { createText, getText, listTexts, replaceStructure, naiveSplit } = require('../dist-electron/src-server/services/article');
  const { createQuestion, bulkCreateQuestions, listQuestions, getQuestion } = require('../dist-electron/src-server/services/question');
  const { createWeakPoint, listWeakPoints, linkWeakPointQuestion } = require('../dist-electron/src-server/services/weakPoint');
  const { generateDungeon, saveDungeon, listDungeons } = require('../dist-electron/src-server/services/rogue');
  const { favoriteQuestion, rankFavoriteTexts } = require('../dist-electron/src-server/services/favorite');
  const { listWrongItems } = require('../dist-electron/src-server/services/wrongItem');
  const { dashboardSummary } = require('../dist-electron/src-server/services/stats');
  const { createProvider, listProviders, activateProvider, getActiveProvider } = require('../dist-electron/src-server/services/apiProvider');

  // 1. 文章
  const text = createText({
    title: '赤壁赋',
    author: '苏轼',
    dynasty: '宋',
    type: '赋',
    full_text: '壬戌之秋，七月既望，苏子与客泛舟游于赤壁之下。清风徐来，水波不兴。',
    length_type: 'long',
  });
  console.log('[OK] 文章已建:', text.id);

  // 2. naiveSplit
  const blocks = naiveSplit(text.full_text);
  console.log('[OK] naiveSplit 段落数:', blocks.length);

  // 3. 手动 replaceStructure
  replaceStructure(text.id, blocks.map((b) => ({
    content: b.content,
    logic_role: '写景抒情',
    sentences: b.sentences,
  })));
  console.log('[OK] 段落已写入');

  // 4. 题目
  const q1 = createQuestion({
    text_id: text.id,
    type: 'choice',
    star: 1,
    prompt: '下列哪个字在《赤壁赋》中指江水?',
    options: ['兴', '来', '不', '徐'],
    answer: '兴',
    source_text: '清风徐来，水波不兴。',
  });
  const q2 = createQuestion({
    text_id: text.id,
    type: 'pure_recitation',
    star: 5,
    prompt: '请默写《赤壁赋》中描写江面风平浪静的句子。',
    answer: '清风徐来，水波不兴。',
  });
  console.log('[OK] 已建题目:', listQuestions({}).length);

  // 5. 易错点
  const wp = createWeakPoint({
    title: '水波不兴易误写为水波不惊',
    text_id: text.id,
    source_text: '清风徐来，水波不兴。',
    target_answer: '水波不兴',
    wrong_examples: ['水波不惊', '水波不醒'],
    weak_type: 'near_synonym_replacement',
    description: '学生容易把"不兴"误写成更常见的"不惊"。',
  });
  linkWeakPointQuestion(wp.id, q1.id);
  console.log('[OK] 易错点已建:', wp.id);

  // 6. Provider (仅写库,无网络调用)
  const pv = createProvider({
    name: 'MiniMax 测试',
    provider_type: 'MiniMax',
    base_url: 'https://api.MiniMax.chat/v1',
    api_key: 'sk-test-dummy',
    default_model: 'MiniMax-M2',
    question_model: 'MiniMax-M2',
    judge_model: 'MiniMax-M2',
    explain_model: 'MiniMax-M2',
    dungeon_model: 'MiniMax-M2',
    weak_point_model: 'MiniMax-M2',
  });
  activateProvider(pv.id);
  console.log('[OK] Provider 已激活:', getActiveProvider()?.name);

  // 7. Rogue 生成(不调 AI,只调本地逻辑)
  const dg = await generateDungeon({
    star: 3,
    article_range: 'single',
    text_ids: [text.id],
    allow_ai_generate_questions: false, // 跳过 AI 临时出题
  });
  const dgId = saveDungeon(dg.dungeon, true);
  console.log('[OK] 副本已建:', dgId, '房间数:', dg.dungeon.rooms.length);

  // 8. 收藏
  favoriteQuestion({ question_id: q1.id, text_id: text.id });
  const ranks = rankFavoriteTexts(10);
  console.log('[OK] 收藏榜第一条:', ranks[0]);

  // 9. Dashboard
  const dash = dashboardSummary();
  console.log('[OK] 仪表盘:', dash);

  // 10. 错题
  const w = listWrongItems();
  console.log('[OK] 错题数:', w.length);

  console.log('\n======== 冒烟测试全部通过 ========');
})().catch((e) => {
  console.error('[FAIL]', e);
  process.exit(1);
});