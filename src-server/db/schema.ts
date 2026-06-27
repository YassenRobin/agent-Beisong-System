/**
 * 数据库 Schema
 * 与产品文档 §21 中给出的 19 张表保持一致。
 * 使用 better-sqlite3 同步驱动,性能足够本地使用。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: Database.Database | null = null;
let dbPathValue = '';

export function initDatabase(filePath: string) {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  dbInstance = db;
  dbPathValue = filePath;
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) throw new Error('数据库未初始化');
  return dbInstance;
}

export function getDatabasePath(): string {
  return dbPathValue;
}

function applySchema(db: Database.Database) {
  db.exec(SCHEMA_SQL);
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS texts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  dynasty TEXT,
  type TEXT,
  difficulty TEXT,
  length_type TEXT,
  full_text TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS catalogs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS catalog_texts (
  catalog_id TEXT NOT NULL,
  text_id TEXT NOT NULL,
  sort_order INTEGER,
  PRIMARY KEY (catalog_id, text_id),
  FOREIGN KEY (catalog_id) REFERENCES catalogs(id),
  FOREIGN KEY (text_id) REFERENCES texts(id)
);

CREATE TABLE IF NOT EXISTS paragraphs (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL,
  paragraph_index INTEGER,
  content TEXT NOT NULL,
  summary TEXT,
  logic_role TEXT,
  FOREIGN KEY (text_id) REFERENCES texts(id)
);

CREATE TABLE IF NOT EXISTS sentences (
  id TEXT PRIMARY KEY,
  paragraph_id TEXT NOT NULL,
  sentence_index INTEGER,
  content TEXT NOT NULL,
  logic_role TEXT,
  keywords_json TEXT,
  FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  text_id TEXT NOT NULL,
  paragraph_id TEXT,
  type TEXT NOT NULL,
  star INTEGER DEFAULT 1,
  difficulty INTEGER,
  prompt TEXT NOT NULL,
  options_json TEXT,
  answer TEXT NOT NULL,
  source_text TEXT,
  logic_role TEXT,
  hint TEXT,
  explanation TEXT,
  created_by TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (text_id) REFERENCES texts(id)
);

CREATE TABLE IF NOT EXISTS api_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  default_model TEXT,
  question_model TEXT,
  judge_model TEXT,
  explain_model TEXT,
  dungeon_model TEXT,
  weak_point_model TEXT,
  temperature REAL DEFAULT 0.3,
  max_tokens INTEGER DEFAULT 4096,
  timeout_seconds INTEGER DEFAULT 60,
  enabled INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  question_id TEXT NOT NULL,
  user_answer TEXT,
  is_correct INTEGER,
  score REAL,
  error_type TEXT,
  feedback TEXT,
  created_at TEXT,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS wrong_items (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  text_id TEXT,
  question_id TEXT,
  expected TEXT,
  actual TEXT,
  error_type TEXT,
  count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  last_wrong_at TEXT
);

CREATE TABLE IF NOT EXISTS weak_points (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text_id TEXT NOT NULL,
  paragraph_id TEXT,
  source_text TEXT,
  target_answer TEXT,
  wrong_examples_json TEXT,
  weak_type TEXT,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (text_id) REFERENCES texts(id)
);

CREATE TABLE IF NOT EXISTS weak_point_questions (
  weak_point_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  generated_by_ai INTEGER DEFAULT 1,
  created_at TEXT,
  PRIMARY KEY (weak_point_id, question_id),
  FOREIGN KEY (weak_point_id) REFERENCES weak_points(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS weak_point_stats (
  weak_point_id TEXT PRIMARY KEY,
  question_count INTEGER DEFAULT 0,
  attempt_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  last_generated_at TEXT,
  last_attempt_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (weak_point_id) REFERENCES weak_points(id)
);

CREATE TABLE IF NOT EXISTS question_stats (
  question_id TEXT PRIMARY KEY,
  attempt_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  wrong_count INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  favorite_count INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS dungeons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  star INTEGER NOT NULL,
  source TEXT,
  article_range TEXT,
  article_types_json TEXT,
  article_ids_json TEXT,
  question_ids_json TEXT,
  rooms_json TEXT,
  damage_rules_json TEXT,
  item_rules_json TEXT,
  clear_condition_json TEXT,
  favorite INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  last_played_at TEXT
);

CREATE TABLE IF NOT EXISTS dungeon_questions (
  dungeon_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  room_id TEXT,
  sort_order INTEGER,
  PRIMARY KEY (dungeon_id, question_id),
  FOREIGN KEY (dungeon_id) REFERENCES dungeons(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS question_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  question_id TEXT NOT NULL,
  text_id TEXT NOT NULL,
  weak_point_id TEXT,
  note TEXT,
  created_at TEXT,
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (text_id) REFERENCES texts(id),
  FOREIGN KEY (weak_point_id) REFERENCES weak_points(id)
);

CREATE TABLE IF NOT EXISTS question_favorite_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS question_favorite_folder_items (
  folder_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (folder_id, question_id),
  FOREIGN KEY (folder_id) REFERENCES question_favorite_folders(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS text_favorite_stats (
  text_id TEXT PRIMARY KEY,
  favorite_question_count INTEGER DEFAULT 0,
  favorite_dungeon_count INTEGER DEFAULT 0,
  total_favorite_count INTEGER DEFAULT 0,
  updated_at TEXT,
  FOREIGN KEY (text_id) REFERENCES texts(id)
);

CREATE TABLE IF NOT EXISTS rogue_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  dungeon_id TEXT,
  text_id TEXT,
  difficulty TEXT,
  max_hearts REAL,
  current_hearts REAL,
  route_json TEXT,
  items_json TEXT,
  result TEXT,
  score REAL,
  stars INTEGER,
  used_hints INTEGER DEFAULT 0,
  created_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS rogue_damage_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  question_id TEXT,
  expected TEXT,
  actual TEXT,
  error_type TEXT,
  damage REAL,
  hearts_after REAL,
  created_at TEXT,
  FOREIGN KEY (run_id) REFERENCES rogue_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_questions_text ON questions(text_id);
CREATE INDEX IF NOT EXISTS idx_questions_paragraph ON questions(paragraph_id);
CREATE INDEX IF NOT EXISTS idx_paragraphs_text ON paragraphs(text_id);
CREATE INDEX IF NOT EXISTS idx_sentences_paragraph ON sentences(paragraph_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_wrong_question ON wrong_items(question_id);
CREATE INDEX IF NOT EXISTS idx_wp_text ON weak_points(text_id);
CREATE INDEX IF NOT EXISTS idx_wp_enabled ON weak_points(enabled);
CREATE INDEX IF NOT EXISTS idx_qff_items_question ON question_favorite_folder_items(question_id);
`;
