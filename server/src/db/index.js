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

export default db;
