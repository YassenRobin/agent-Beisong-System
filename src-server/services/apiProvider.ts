/**
 * API Provider 服务:增删改查、激活、测试连接
 */
import { execute, nowIso, selectAll, selectOne, uid, transaction } from '../db/helpers';
import { decryptSecret, encryptSecret } from './encryption';
import { ALL_PROVIDERS, getProvider } from '../ai/registry';

export const PROVIDER_LABELS: Record<string, string> = {
  MiniMax: 'MiniMax',
  qwen: '通义千问 (Qwen)',
  kimi: 'Kimi (Moonshot)',
  deepseek: 'DeepSeek',
};

/** 启动时确保 4 家厂商都已在库中,且 base_url / 默认模型始终与代码侧保持一致 */
export function seedDefaultProviders() {
  transaction(() => {
    for (const p of ALL_PROVIDERS) {
      const defs = defaultsForType(p.id);
      const existing = selectOne<any>(
        `SELECT id, base_url, default_model, name FROM api_providers WHERE provider_type = ? LIMIT 1`,
        [p.id],
      );
      if (!existing) {
        // 新增:插入默认占位记录(未填 Key、停用)
        execute(
          `INSERT INTO api_providers (id, name, provider_type, base_url, api_key_encrypted,
             default_model, question_model, judge_model, explain_model, dungeon_model, weak_point_model,
             temperature, max_tokens, timeout_seconds, enabled, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            uid('pv_'),
            PROVIDER_LABELS[p.id] || p.name,
            p.id,
            defs.base_url || '',
            '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            0.3,
            4096,
            60,
            0,
            nowIso(),
            nowIso(),
          ],
        );
      } else {
        // 已存在:同步刷新 base_url 和默认模型(用户 Key / 激活状态不动)
        // 这样代码侧更新默认模型时,已 seed 的库记录也会跟上
        execute(
          `UPDATE api_providers SET base_url = ?, default_model = ?,
             question_model = COALESCE(NULLIF(question_model, ''), ?),
             judge_model = COALESCE(NULLIF(judge_model, ''), ?),
             explain_model = COALESCE(NULLIF(explain_model, ''), ?),
             dungeon_model = COALESCE(NULLIF(dungeon_model, ''), ?),
             weak_point_model = COALESCE(NULLIF(weak_point_model, ''), ?),
             updated_at = ? WHERE id = ?`,
          [
            defs.base_url || existing.base_url || '',
            defs.default_model || existing.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            defs.default_model || '',
            nowIso(),
            existing.id,
          ],
        );
      }
    }
  });
}

export type ProviderInput = {
  name: string;
  provider_type: string;
  base_url: string;
  api_key?: string;            // 明文,内部加密
  default_model?: string;
  question_model?: string;
  judge_model?: string;
  explain_model?: string;
  dungeon_model?: string;
  weak_point_model?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_seconds?: number;
  enabled?: number;
};

export type ProviderRecord = Omit<ProviderInput, 'api_key'> & {
  id: string;
  api_key_masked: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function defaultsForType(type: string): Partial<ProviderInput> {
  const p = getProvider(type);
  if (!p) return {};
  const opts = (p as any).options || {};
  return {
    base_url: opts.defaultBaseUrl,
    default_model: opts.defaultModel,
  };
}

export function listProviders(): ProviderRecord[] {
  const rows = selectAll<any>(`SELECT * FROM api_providers ORDER BY created_at DESC`);
  return rows.map((r) => toRecord(r));
}

export function getProviderById(id: string): ProviderRecord | undefined {
  const row = selectOne<any>(`SELECT * FROM api_providers WHERE id = ?`, [id]);
  return row ? toRecord(row) : undefined;
}

export function createProvider(input: ProviderInput): ProviderRecord {
  if (!input.provider_type || !ALL_PROVIDERS.some((p) => p.id === input.provider_type)) {
    throw new Error(`不支持的 Provider 类型: ${input.provider_type}`);
  }
  const defaults = defaultsForType(input.provider_type);
  const id = uid('pv_');
  const now = nowIso();
  const apiKeyEnc = input.api_key ? encryptSecret(input.api_key) : '';
  execute(
    `INSERT INTO api_providers
      (id, name, provider_type, base_url, api_key_encrypted,
       default_model, question_model, judge_model, explain_model, dungeon_model, weak_point_model,
       temperature, max_tokens, timeout_seconds, enabled, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      input.name,
      input.provider_type,
      input.base_url || defaults.base_url || '',
      apiKeyEnc,
      input.default_model || defaults.default_model || '',
      input.question_model || '',
      input.judge_model || '',
      input.explain_model || '',
      input.dungeon_model || '',
      input.weak_point_model || '',
      input.temperature ?? 0.3,
      input.max_tokens ?? 4096,
      input.timeout_seconds ?? 60,
      input.enabled ?? 1,
      now,
      now,
    ],
  );
  activateIfNoActiveProvider(id);
  return getProviderById(id)!;
}

export function updateProvider(id: string, input: Partial<ProviderInput>): ProviderRecord {
  const existing = getProviderById(id);
  if (!existing) throw new Error('Provider 不存在');
  const merged: ProviderInput = { ...existing, ...input };
  const apiKeyEnc = input.api_key ? encryptSecret(input.api_key) : existing.api_key_masked ? existing.api_key_masked : '';
  // 兼容:仅当显式传 api_key 字段时更新加密
  const useEnc = input.api_key !== undefined ? apiKeyEnc : selectOne<any>(`SELECT api_key_encrypted FROM api_providers WHERE id = ?`, [id])?.api_key_encrypted || '';
  execute(
    `UPDATE api_providers SET
       name = ?, provider_type = ?, base_url = ?, api_key_encrypted = ?,
       default_model = ?, question_model = ?, judge_model = ?, explain_model = ?,
       dungeon_model = ?, weak_point_model = ?,
       temperature = ?, max_tokens = ?, timeout_seconds = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    [
      merged.name,
      merged.provider_type,
      merged.base_url || '',
      useEnc,
      merged.default_model || '',
      merged.question_model || '',
      merged.judge_model || '',
      merged.explain_model || '',
      merged.dungeon_model || '',
      merged.weak_point_model || '',
      merged.temperature ?? 0.3,
      merged.max_tokens ?? 4096,
      merged.timeout_seconds ?? 60,
      merged.enabled ?? 1,
      nowIso(),
      id,
    ],
  );
  activateIfNoActiveProvider(id);
  return getProviderById(id)!;
}

function activateIfNoActiveProvider(id: string) {
  const active = selectOne<any>(`SELECT id FROM api_providers WHERE is_active = 1 LIMIT 1`);
  if (active) return;
  const row = selectOne<any>(`SELECT id, api_key_encrypted, enabled FROM api_providers WHERE id = ?`, [id]);
  if (!row?.enabled || !row.api_key_encrypted) return;
  execute(`UPDATE api_providers SET is_active = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
}

export function deleteProvider(id: string) {
  execute(`DELETE FROM api_providers WHERE id = ?`, [id]);
}

export function activateProvider(id: string) {
  transaction(() => {
    execute(`UPDATE api_providers SET is_active = 0`);
    execute(`UPDATE api_providers SET is_active = 1, updated_at = ? WHERE id = ?`, [nowIso(), id]);
  });
}

export async function testProvider(id: string): Promise<{ ok: boolean; message: string }> {
  const p = getProviderById(id);
  if (!p) return { ok: false, message: 'Provider 不存在' };
  const provider = getProvider(p.provider_type);
  if (!provider) return { ok: false, message: '不支持的 Provider 类型' };
  const apiKey = decryptSecret(
    selectOne<any>(`SELECT api_key_encrypted FROM api_providers WHERE id = ?`, [id])?.api_key_encrypted || '',
  );
  if (!apiKey) return { ok: false, message: '尚未填写 API Key' };
  return provider.testConnection(apiKey, p.base_url || '', p.default_model || '');
}

export function getActiveProvider(): (ProviderRecord & { api_key_encrypted: string }) | null {
  const row = selectOne<any>(`SELECT * FROM api_providers WHERE is_active = 1 LIMIT 1`);
  if (!row) return null;
  return toRecord(row);
}

function toRecord(r: any): ProviderRecord & { api_key_encrypted: string } {
  const enc = r.api_key_encrypted || '';
  return {
    id: r.id,
    name: r.name,
    provider_type: r.provider_type,
    base_url: r.base_url,
    api_key_masked: enc ? maskKeyPreview(decryptSecret(enc)) : '',
    api_key_encrypted: enc,
    default_model: r.default_model || '',
    question_model: r.question_model || '',
    judge_model: r.judge_model || '',
    explain_model: r.explain_model || '',
    dungeon_model: r.dungeon_model || '',
    weak_point_model: r.weak_point_model || '',
    temperature: r.temperature ?? 0.3,
    max_tokens: r.max_tokens ?? 4096,
    timeout_seconds: r.timeout_seconds ?? 60,
    enabled: r.enabled ?? 1,
    is_active: r.is_active ?? 0,
    created_at: r.created_at || '',
    updated_at: r.updated_at || '',
  };
}

function maskKeyPreview(k: string): string {
  if (!k) return '';
  if (k.length <= 8) return '****';
  return k.slice(0, 4) + '****' + k.slice(-4);
}
