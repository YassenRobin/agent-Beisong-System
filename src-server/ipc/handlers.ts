/**
 * IPC 处理器:所有 channel 以 "domain:action" 命名
 */
import type { BrowserWindow, IpcMain } from 'electron';
import * as apiProvider from '../services/apiProvider';
import * as article from '../services/article';
import * as question from '../services/question';
import * as weakPoint from '../services/weakPoint';
import * as favorite from '../services/favorite';
import * as wrongItem from '../services/wrongItem';
import * as stats from '../services/stats';
import * as rogue from '../services/rogue';
import * as ai from '../ai/service';
import { judgeLocally } from '../services/localJudge';
import { ALL_PROVIDERS } from '../ai/registry';
import { selectAll as dbSelectAll } from '../db/helpers';

type Handler = (payload: any) => Promise<unknown> | unknown;

export function registerIpcHandlers(ipcMain: IpcMain, _getWindow: () => BrowserWindow | null) {
  const handlers: Record<string, Handler> = {
    // ===== Dashboard =====
    'dashboard:summary': () => stats.dashboardSummary(),
    'dashboard:recent-runs': (_p: { limit?: number }) => stats.recentRuns(_p?.limit || 10),

    // ===== Provider =====
    'provider:list': () => apiProvider.listProviders(),
    'provider:create': (p) => apiProvider.createProvider(p),
    'provider:update': (p) => apiProvider.updateProvider(p.id, p),
    'provider:delete': (p) => apiProvider.deleteProvider(p.id),
    'provider:activate': (p) => apiProvider.activateProvider(p.id),
    'provider:test': async (p) => apiProvider.testProvider(p.id),
    'provider:types': () => ALL_PROVIDERS.map((p) => ({ id: p.id, name: p.name })),

    // ===== Article =====
    'article:list': (p) => article.listTexts(p || {}),
    'article:get': (p) => article.getText(p.id),
    'article:create': (p) => article.createText(p),
    'article:update': (p) => article.updateText(p.id, p),
    'article:delete': (p) => article.deleteText(p.id),
    'article:import-json': (p) => article.importTextsFromJson(p.json),
    'article:paragraphs': (p) => article.listParagraphs(p.id),
    'article:sentences': (p) => article.listSentences(p.id),
    'article:replace-structure': (p) => article.replaceStructure(p.id, p.paragraphs),
    'article:naive-split': (p) => article.naiveSplit(p.full_text),
    'article:ai-structure': async (p) => {
      const res = await ai.structureText({ title: p.title, author: p.author, fullText: p.full_text });
      // 自动落库
      article.replaceStructure(p.id, res);
      return res;
    },

    // ===== Question =====
    'question:list': (p) => question.listQuestions(p || {}),
    'question:get': (p) => question.getQuestion(p.id),
    'question:create': (p) => question.createQuestion(p),
    'question:update': (p) => question.updateQuestion(p.id, p),
    'question:delete': (p) => question.deleteQuestion(p.id),
    'question:set-enabled': (p) => question.setQuestionEnabled(p.id, p.enabled),
    'question:ai-preview': async (p) => {
      const { paragraph, title, author, types, count, starRange, weakPointContext } = p;
      return ai.generateQuestions({ title, author, paragraph, types, count, starRange, weakPointContext });
    },
    'question:import-generated': (p) => {
      const { text_id, paragraph_id, items } = p;
      return question.bulkCreateQuestions(items || [], { text_id, paragraph_id, created_by: 'ai' });
    },
    'question:ai-generate': async (p) => {
      const { text_id, paragraph_id, paragraph, title, author, types, count, starRange, weakPointContext } = p;
      const items = await ai.generateQuestions({ title, author, paragraph, types, count, starRange, weakPointContext });
      const records = question.bulkCreateQuestions(items, { text_id, paragraph_id, created_by: 'ai' });
      return records;
    },
    'question:judge': async (p) => {
      const q = p.question_id ? question.getQuestion(p.question_id) : undefined;
      const result = judgeLocally({
        expected: q?.answer || p.expected,
        actual: p.actual,
        questionType: q?.type || p.questionType,
        star: q?.star || p.star,
      });
      // 自动写入答题记录
      question.recordAttempt({
        question_id: p.question_id,
        user_answer: p.actual,
        is_correct: result.is_correct,
        score: result.score,
        error_type: result.error_type,
        feedback: result.feedback,
      });
      // 触发易错点统计刷新
      if (q) {
        const links = dbSelectAll<{ weak_point_id: string }>(
          `SELECT weak_point_id FROM weak_point_questions WHERE question_id = ?`,
          [q.id],
        );
        for (const l of links) {
          weakPoint.refreshWeakPointStats(l.weak_point_id);
        }
      }
      return result;
    },
    'question:explain': async (p) => ai.explainError(p),
    'question:attempts': (p) => question.listAttempts(p?.question_id, p?.limit || 20),

    // ===== Weak Point =====
    'weak-point:list': (p) => weakPoint.listWeakPoints(p || {}),
    'weak-point:get': (p) => weakPoint.getWeakPoint(p.id),
    'weak-point:create': (p) => weakPoint.createWeakPoint(p),
    'weak-point:update': (p) => weakPoint.updateWeakPoint(p.id, p),
    'weak-point:delete': (p) => weakPoint.deleteWeakPoint(p.id),
    'weak-point:toggle': (p) => weakPoint.toggleWeakPoint(p.id, p.enabled),
    'weak-point:questions': (p) => weakPoint.listWeakPointQuestions(p.id),
    'weak-point:ai-preview': async (p) => {
      const { weak_point_id, types, count, stars, description } = p;
      const wp = weakPoint.getWeakPoint(weak_point_id);
      if (!wp) throw new Error('鏄撻敊鐐逛笉瀛樺湪');
      if (p.text_id && wp.text_id !== p.text_id) throw new Error('Selected weak point does not belong to the current article');
      const text = article.getText(wp.text_id);
      if (!text) throw new Error('鏄撻敊鐐规墍灞炴枃绔犱笉瀛樺湪');
      return ai.generateQuestionsByWeakPoint({
        weakPoint: {
          title: wp.title,
          source_text: wp.source_text,
          article_full_text: text?.full_text || wp.source_text,
          target_answer: wp.target_answer,
          wrong_examples: wp.wrong_examples,
          weak_type: wp.weak_type,
          description: description || wp.description,
        },
        types: types || ['choice', 'blank', 'context_recitation', 'pure_recitation'],
        count: count || 6,
        stars: stars || [1, 2, 3, 4],
      });
    },
    'weak-point:import-generated': (p) => {
      const { weak_point_id, items } = p;
      const wp = weakPoint.getWeakPoint(weak_point_id);
      if (!wp) throw new Error('鏄撻敊鐐逛笉瀛樺湪');
      const records = question.bulkCreateQuestions(items || [], { text_id: wp.text_id, paragraph_id: wp.paragraph_id, created_by: 'ai_weak_point' });
      for (const r of records) {
        weakPoint.linkWeakPointQuestion(weak_point_id, r.id);
      }
      return records;
    },
    'weak-point:ai-generate': async (p) => {
      const { weak_point_id, types, count, stars, description } = p;
      const wp = weakPoint.getWeakPoint(weak_point_id);
      if (!wp) throw new Error('易错点不存在');
      if (p.text_id && wp.text_id !== p.text_id) throw new Error('所选易错点不属于当前文章');
      const text = article.getText(wp.text_id);
      if (!text) throw new Error('易错点所属文章不存在');
      const items = await ai.generateQuestionsByWeakPoint({
        weakPoint: {
          title: wp.title,
          source_text: wp.source_text,
          article_full_text: text?.full_text || wp.source_text,
          target_answer: wp.target_answer,
          wrong_examples: wp.wrong_examples,
          weak_type: wp.weak_type,
          description: description || wp.description,
        },
        types: types || ['choice', 'blank', 'context_recitation', 'pure_recitation'],
        count: count || 6,
        stars: stars || [1, 2, 3, 4],
      });
      const records = question.bulkCreateQuestions(items, { text_id: wp.text_id, paragraph_id: wp.paragraph_id, created_by: 'ai_weak_point' });
      for (const r of records) {
        weakPoint.linkWeakPointQuestion(weak_point_id, r.id);
      }
      return records;
    },
    'weak-point:ranking': (p) => weakPoint.rankingWeakPoints(p?.by || 'accuracy', p?.limit || 20),

    // ===== Wrong =====
    'wrong:list': (p) => wrongItem.listWrongItems(p || {}),
    'wrong:resolve': (p) => wrongItem.markResolved(p.id),
    'wrong:re-add': (p) => wrongItem.reAdd(p.id),

    // ===== Favorite =====
    'favorite:question': (p) => favorite.favoriteQuestion(p),
    'favorite:questions': (p) => favorite.bulkFavoriteQuestions(p),
    'favorite:question-remove': (p) => favorite.unfavoriteQuestion(p.question_id),
    'favorite:list-questions': (p) => favorite.listFavoriteQuestions(p || {}),
    'favorite:create-folder': (p) => favorite.createQuestionFolder(p.name),
    'favorite:list-folders': () => favorite.listQuestionFolders(),
    'favorite:delete-folder': (p) => favorite.deleteQuestionFolder(p.id),
    'favorite:add-to-folder': (p) => favorite.addFavoriteQuestionsToFolder(p),
    'favorite:rank-texts': (p) => favorite.rankFavoriteTexts(p?.limit || 20),
    'favorite:rank-types': (p) => favorite.rankFavoriteTypes(p?.limit || 20),

    // ===== Rogue =====
    'rogue:generate': async (p) => rogue.generateDungeon(p),
    'rogue:save': (p) => rogue.saveDungeon(p.dungeon, p.favorite || false, p.source || 'generated'),
    'rogue:list': (p) => rogue.listDungeons(p || {}),
    'rogue:get': (p) => rogue.getDungeon(p.id),
    'rogue:favorite': (p) => rogue.setDungeonFavorite(p.id, p.favorite),
    'rogue:delete': (p) => rogue.deleteDungeon(p.id),
    'rogue:run-start': (p) => rogue.startRun(p),
    'rogue:run-finish': (p) => rogue.finishRun(p.id, p),
    'rogue:run-log-damage': (p) => rogue.logDamage(p.run_id, p),

    // ===== Misc =====
    'app:ping': () => 'pong',
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, payload) => {
      try {
        const result = await handler(payload);
        return { ok: true, data: result };
      } catch (err: any) {
        console.error(`[ipc] ${channel} failed:`, err);
        return { ok: false, error: err?.message || String(err) };
      }
    });
  }
}
