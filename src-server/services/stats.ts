/**
 * 统计服务
 */
import { selectAll, selectOne } from '../db/helpers';

export function dashboardSummary() {
  const texts = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM texts`)?.c || 0;
  const questions = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM questions`)?.c || 0;
  const weakPoints = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM weak_points`)?.c || 0;
  const favorites = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM question_favorites`)?.c || 0;
  const dungeons = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM dungeons`)?.c || 0;
  const wrongItems = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM wrong_items WHERE status = 'active'`)?.c || 0;
  const runs = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM rogue_runs WHERE result = 'win'`)?.c || 0;
  const providers = selectOne<{ c: number }>(`SELECT COUNT(*) AS c FROM api_providers`)?.c || 0;
  const activeProvider = selectOne<{ id: string; name: string; provider_type: string }>(`SELECT id, name, provider_type FROM api_providers WHERE is_active = 1 LIMIT 1`);
  return { texts, questions, weakPoints, favorites, dungeons, wrongItems, runs, providers, activeProvider };
}

export function recentRuns(limit = 10) {
  return selectAll<any>(
    `SELECT r.*, d.name AS dungeon_name FROM rogue_runs r
     LEFT JOIN dungeons d ON d.id = r.dungeon_id
     ORDER BY r.created_at DESC LIMIT ?`,
    [limit],
  );
}