const path = require('node:path');

const resolved = require.resolve('better-sqlite3');
const instances = [];

class FakeDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.pragmas = [];
    this.execSql = [];
    instances.push(this);
  }

  pragma(sql) {
    this.pragmas.push(sql);
    if (sql === 'journal_mode = WAL') {
      const error = new Error('unable to open database file');
      error.code = 'SQLITE_CANTOPEN';
      throw error;
    }
  }

  exec(sql) {
    this.execSql.push(sql);
  }
}

require.cache[resolved] = {
  id: resolved,
  filename: resolved,
  loaded: true,
  exports: FakeDatabase,
};

const { initDatabase } = require('../dist-electron/src-server/db/schema');

const db = initDatabase(path.join(process.cwd(), '.tmp-seed', 'wal-fallback.db'));
const instance = instances[0];

if (db !== instance) {
  throw new Error('initDatabase did not return the opened database instance');
}
if (!instance.pragmas.includes('journal_mode = DELETE')) {
  throw new Error('initDatabase did not use DELETE journal mode');
}
if (instance.pragmas.includes('journal_mode = WAL')) {
  throw new Error('initDatabase should not use WAL mode for this single-window desktop app');
}
if (instance.execSql.length !== 1) {
  throw new Error('schema was not applied after WAL fallback');
}

console.log(JSON.stringify({ ok: true, pragmas: instance.pragmas }));
