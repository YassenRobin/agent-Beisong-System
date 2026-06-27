const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const root = path.resolve(__dirname, '..');
const userData = process.env.BEISONG_SMOKE_USER_DATA || path.join(root, '.tmp-seed', 'electron-user-data');
const dbPath = path.join(userData, 'data', 'beisong.db');

app.setPath('userData', userData);

app.whenReady()
  .then(() => {
    if (process.env.BEISONG_SMOKE_KEEP_DB !== '1') {
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
    if (process.env.BEISONG_SMOKE_IMPORT_HANDLERS === '1') {
      require('../dist-electron/src-server/ipc/handlers');
    }
    if (process.env.BEISONG_SMOKE_LOAD_DOTENV === '1') {
      require('../dist-electron/src-server/services/dotenv').loadDotEnv();
    }
    const { initDatabase } = require('../dist-electron/src-server/db');
    const { seedDefaultProviders, listProviders } = require('../dist-electron/src-server/services/apiProvider');

    initDatabase(dbPath);
    seedDefaultProviders();

    const providers = listProviders();
    if (providers.length !== 4) {
      throw new Error(`expected 4 seeded providers, got ${providers.length}`);
    }
    console.log(JSON.stringify({ ok: true, providers: providers.length, dbPath }));
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
