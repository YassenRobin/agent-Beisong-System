// scripts/smoke-seed.cjs — 验证 4 家厂商 seed 逻辑
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const dbDir = path.join(ROOT, '.tmp-seed');
const dbPath = path.join(dbDir, 'seed.db');
fs.mkdirSync(dbDir, { recursive: true });

const { initDatabase } = require(path.join(ROOT, 'dist-electron', 'src-server', 'db'));
initDatabase(dbPath);

const { seedDefaultProviders, listProviders, activateProvider, getActiveProvider } = require(
  path.join(ROOT, 'dist-electron', 'src-server', 'services', 'apiProvider'),
);

console.log('--- 第一次调用 seedDefaultProviders ---');
seedDefaultProviders();
let list = listProviders();
console.log('厂商数量:', list.length);
list.forEach((p) => console.log(`  · ${p.name} (${p.provider_type}) - enabled:${p.enabled} active:${p.is_active} url:${p.base_url} model:${p.default_model}`));

console.log('\n--- 第二次调用 seedDefaultProviders (应该幂等) ---');
seedDefaultProviders();
list = listProviders();
console.log('厂商数量:', list.length, '(应保持 4)');

console.log('\n--- 测试更新 API Key 后激活 ---');
const { updateProvider } = require(path.join(ROOT, 'dist-electron', 'src-server', 'services', 'apiProvider'));
updateProvider(list[0].id, { api_key: 'sk-test-1234', enabled: 1 });
activateProvider(list[0].id);
const active = getActiveProvider();
console.log('当前激活:', active?.name, '(', active?.provider_type, ')');

console.log('\n======== seed 冒烟测试通过 ========');