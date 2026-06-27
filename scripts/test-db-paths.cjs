const fs = require('node:fs');
const path = require('node:path');

const root = path.join(process.cwd(), '.tmp-seed', 'paths-test');
const roaming = path.join(root, 'roaming');
const local = path.join(root, 'local');
const legacyDir = path.join(roaming, 'data');
const legacyDb = path.join(legacyDir, 'beisong.db');

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(legacyDir, { recursive: true });
fs.writeFileSync(legacyDb, 'legacy-db');
fs.writeFileSync(`${legacyDb}-wal`, 'legacy-wal');
fs.writeFileSync(`${legacyDb}-shm`, 'legacy-shm');

const fakeApp = {
  getPath(name) {
    if (name === 'userData') return roaming;
    if (name === 'appData') return path.join(root, 'fallback-appdata');
    throw new Error(`unexpected path name: ${name}`);
  },
};

const { resolveDatabasePath } = require('../dist-electron/electron/paths');
const dbPath = resolveDatabasePath(fakeApp, local);
const expected = path.join(local, 'beisong', 'data', 'beisong.db');

if (dbPath !== expected) {
  throw new Error(`expected ${expected}, got ${dbPath}`);
}
if (fs.readFileSync(expected, 'utf8') !== 'legacy-db') {
  throw new Error('legacy database was not migrated to localData');
}
if (fs.readFileSync(`${expected}-wal`, 'utf8') !== 'legacy-wal') {
  throw new Error('legacy WAL was not migrated to localData');
}
if (fs.readFileSync(`${expected}-shm`, 'utf8') !== 'legacy-shm') {
  throw new Error('legacy SHM was not migrated to localData');
}

console.log(JSON.stringify({ ok: true, dbPath }));
