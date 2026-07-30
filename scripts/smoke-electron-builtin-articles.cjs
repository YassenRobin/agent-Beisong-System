const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');

const dbPath = path.join(os.tmpdir(), `beisong-builtin-articles-${Date.now()}.db`);

app.whenReady().then(() => {
  const { getDb, initDatabase } = require('../dist-electron/src-server/db/schema.js');
  const { seedBuiltinArticles } = require('../dist-electron/src-server/services/article.js');

  initDatabase(dbPath);
  assert.deepEqual(seedBuiltinArticles(), { initialized: true, created: 40, preserved: 0 });
  assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts').get().count, 40);
  assert.deepEqual(seedBuiltinArticles(), { initialized: false, created: 0, preserved: 0 });

  getDb().prepare('DELETE FROM texts WHERE title = ?').run('登高');
  seedBuiltinArticles();
  assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('登高').count, 0);

  getDb().close();
  fs.rmSync(dbPath, { force: true });
  console.log('electron builtin articles seed smoke test passed');
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
