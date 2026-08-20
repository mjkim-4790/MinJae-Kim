import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const schemaPath = path.join(__dirname, 'schema.sql');

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = config.dbPath ?? path.join(dataDir, 'recreation.sqlite');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(schemaPath, 'utf8'));

// CREATE TABLE IF NOT EXISTS 는 이미 배포된 DB의 기존 테이블에 새 컬럼을 소급 적용하지
// 못한다 — 이 프로젝트엔 별도 마이그레이션 도구가 없어서, 없는 컬럼만 골라 직접 추가한다.
// 새로 추가되는 계정 유형 컬럼: 기존 행은 전부 DEFAULT 'mc' 로 채워져 자동으로 MC 전용
// 계정이 된다(운영 결정 — 지금까지 만든 계정은 전부 행사 진행용이었으므로).
const operatorColumns = db.prepare("PRAGMA table_info(operators)").all().map((c) => c.name);
if (!operatorColumns.includes('account_type')) {
  db.exec(
    "ALTER TABLE operators ADD COLUMN account_type TEXT NOT NULL DEFAULT 'mc' CHECK (account_type IN ('mc', 'personal'))",
  );
}

export default db;
