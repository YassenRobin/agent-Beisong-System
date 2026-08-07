const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const phase = process.env.BEISONG_BUILTIN_SMOKE_PHASE || '';
const dbPath = process.env.BEISONG_BUILTIN_SMOKE_DB
  || path.join(os.tmpdir(), `beisong-builtin-articles-${Date.now()}.db`);
const teacherArticle = {
  title: '赤壁赋',
  author: '教师修订',
  dynasty: '宋',
  type: '古文',
  difficulty: '教师难度',
  length_type: '教师分段',
  full_text: '教师已经校订的版本。',
  enabled: 1,
};

function removeDatabaseFiles() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function runElectronPhase(nextPhase) {
  const result = childProcess.spawnSync(
    process.execPath,
    ['--no-sandbox', __filename],
    {
      env: {
        ...process.env,
        BEISONG_BUILTIN_SMOKE_PHASE: nextPhase,
        BEISONG_BUILTIN_SMOKE_DB: dbPath,
      },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Electron smoke phase "${nextPhase}" failed`);
}

async function runWorker(app) {
  const { getDb, initDatabase } = require('../dist-electron/src-server/db/schema.js');
  const {
    createText,
    deleteText,
    seedBuiltinArticles,
  } = require('../dist-electron/src-server/services/article.js');

  initDatabase(dbPath);
  if (phase === 'initialize') {
    createText(teacherArticle);
    assert.deepEqual(
      seedBuiltinArticles(),
      { initialized: true, created: 71, preserved: 1, updated: 0, removed: 0, catalogs: 7 },
    );
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts').get().count, 72);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM catalogs').get().count, 7);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM catalog_texts').get().count, 72);

    const preserved = getDb().prepare('SELECT * FROM texts WHERE title = ?').get(teacherArticle.title);
    for (const [key, value] of Object.entries(teacherArticle)) {
      assert.equal(preserved[key], value, `teacher article field changed: ${key}`);
    }

    const deleted = getDb().prepare('SELECT id FROM texts WHERE title = ?').get('登高');
    assert.ok(deleted?.id, 'missing builtin article 登高');
    deleteText(deleted.id);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts').get().count, 71);
  } else if (phase === 'restart') {
    assert.deepEqual(seedBuiltinArticles(), { initialized: false, created: 0, preserved: 0, updated: 0, removed: 0, catalogs: 0 });
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts').get().count, 71);

    const preserved = getDb().prepare('SELECT * FROM texts WHERE title = ?').get(teacherArticle.title);
    for (const [key, value] of Object.entries(teacherArticle)) {
      assert.equal(preserved[key], value, `teacher article field changed after restart: ${key}`);
    }
    assert.equal(
      getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('登高').count,
      0,
    );
    assert.ok(
      getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('builtin_articles_v2_72'),
      'missing persistent builtin article seed marker',
    );
  } else if (phase === 'migrate') {
    createText({ ...teacherArticle, title: '赤壁赋', full_text: '旧版内置赤壁赋。' });
    createText({ ...teacherArticle, title: '氓', full_text: '旧版内置氓。' });
    createText({ ...teacherArticle, title: '石头城', full_text: '错误占位篇目。' });
    getDb().prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ).run('builtin_articles_v1', '{}', new Date().toISOString());

    assert.deepEqual(
      seedBuiltinArticles(),
      { initialized: true, created: 71, preserved: 0, updated: 1, removed: 2, catalogs: 7 },
    );
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts').get().count, 72);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('氓').count, 0);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('石头城').count, 0);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('离骚（节选）').count, 1);
    assert.equal(getDb().prepare('SELECT COUNT(*) AS count FROM texts WHERE title = ?').get('琵琶行（并序）').count, 1);
    assert.notEqual(
      getDb().prepare('SELECT full_text FROM texts WHERE title = ?').get('赤壁赋').full_text,
      '旧版内置赤壁赋。',
    );
  } else {
    throw new Error(`unknown Electron smoke phase: ${phase}`);
  }

  getDb().close();
  console.log(`electron builtin articles ${phase} phase passed`);
  app.quit();
}

const { app } = require('electron');

app.whenReady().then(async () => {
  if (phase) {
    await runWorker(app);
    return;
  }

  removeDatabaseFiles();
  try {
    runElectronPhase('initialize');
    runElectronPhase('restart');
    removeDatabaseFiles();
    runElectronPhase('migrate');
    console.log('electron builtin articles cross-restart smoke test passed');
  } finally {
    removeDatabaseFiles();
  }
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
