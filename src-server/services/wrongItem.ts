/**
 * 错题本服务
 */
import { execute, nowIso, selectAll, selectOne, uid } from '../db/helpers';

export type WrongItem = {
  id: string;
  question_id: string;
  text_id: string;
  expected: string;
  actual: string;
  error_type: string;
  count: number;
  status: 'active' | 'resolved';
  last_wrong_at: string;
};

export function listWrongItems(opts: { text_id?: string; status?: 'active' | 'resolved' } = {}): WrongItem[] {
  const conds: string[] = [];
  const params: any[] = [];
  if (opts.text_id) { conds.push('text_id = ?'); params.push(opts.text_id); }
  if (opts.status) { conds.push('status = ?'); params.push(opts.status); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return selectAll<WrongItem>(`SELECT * FROM wrong_items ${where} ORDER BY last_wrong_at DESC`, params);
}

export function markResolved(id: string) {
  execute(`UPDATE wrong_items SET status = 'resolved' WHERE id = ?`, [id]);
}

export function reAdd(id: string) {
  execute(`UPDATE wrong_items SET status = 'active', count = count + 1, last_wrong_at = ? WHERE id = ?`, [nowIso(), id]);
}