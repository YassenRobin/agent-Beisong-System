import fs from 'node:fs';
import path from 'node:path';

type PathApp = {
  getPath(name: 'userData' | 'appData'): string;
};

const DB_FILE = 'beisong.db';
const DB_SUFFIXES = ['', '-wal', '-shm'];

export function resolveDatabasePath(app: PathApp, localAppData = process.env.LOCALAPPDATA): string {
  const legacyDir = path.join(app.getPath('userData'), 'data');
  const localRoot = localAppData || app.getPath('appData');
  const targetDir = path.join(localRoot, 'beisong', 'data');
  const legacyPath = path.join(legacyDir, DB_FILE);
  const targetPath = path.join(targetDir, DB_FILE);

  fs.mkdirSync(targetDir, { recursive: true });
  migrateLegacyDatabase(legacyPath, targetPath);

  return targetPath;
}

function migrateLegacyDatabase(legacyPath: string, targetPath: string) {
  if (path.resolve(legacyPath) === path.resolve(targetPath)) return;
  if (fs.existsSync(targetPath) || !fs.existsSync(legacyPath)) return;

  for (const suffix of DB_SUFFIXES) {
    const from = `${legacyPath}${suffix}`;
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, `${targetPath}${suffix}`);
  }
}
