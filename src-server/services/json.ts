/**
 * 容错 JSON 解析:AI 可能把 JSON 包在 ```json ``` 中,
 * 也可能在末尾加闲言碎语,这里尽量抠出 JSON 段。
 */
export function safeJsonParse<T = any>(text: string): T | null {
  if (!text) return null;
  let s = text.trim();
  // 去代码块包裹
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // 直接尝试
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }
  try { return JSON.parse(repairJson(s)) as T; } catch { /* fallthrough */ }

  // 找第一段 { ... } 或 [ ... ] 平衡区间
  const first = s.indexOf('{');
  const arrIdx = s.indexOf('[');
  if (first < 0 && arrIdx < 0) {
    return null;
  }
  const useArray = arrIdx >= 0 && (first < 0 || arrIdx < first);
  const jsonStr = useArray ? extractBalanced(s, arrIdx, '[', ']') : extractBalanced(s, first, '{', '}');
  try { return JSON.parse(jsonStr) as T; } catch { /* fallthrough */ }
  try { return JSON.parse(repairJson(jsonStr)) as T; } catch { /* fallthrough */ }
  return null;
}

function repairJson(s: string): string {
  return s
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function extractBalanced(s: string, start: number, open: string, close: string): string {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}
