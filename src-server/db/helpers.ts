/**
 * 数据库通用操作工具
 */
import { getDb } from './schema';

export type Row = Record<string, any>;

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = ''): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}${ts}${rnd}`;
}

export function selectAll<T = Row>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function selectOne<T = Row>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function execute(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const info = getDb().prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export function transaction<T>(fn: () => T): T {
  const txn = getDb().transaction(fn);
  return txn();
}