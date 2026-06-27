/**
 * 简单的 .env 文件加载器 (避免引入 dotenv 依赖)
 * 同时加载 .env、.env.local (后者覆盖)
 */
import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

export function loadDotEnv() {
  if (loaded) return;
  loaded = true;

  const root = path.resolve(process.cwd());
  const envFiles = ['.env.local', '.env'];
  for (const filename of envFiles) {
    const filePath = path.join(root, filename);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // 去掉引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}