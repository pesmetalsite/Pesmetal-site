const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(ROOT, 'src/lib/schema.sql'), 'utf-8');

const template = [
  '/**',
  ' * PESMETAL — Database Adapter',
  ' * Usa node:sqlite (built-in Node 22+).',
  ' */',
  '',
  "import { DatabaseSync } from 'node:sqlite';",
  "import path from 'node:path';",
  "import fs from 'node:fs';",
  '',
  "const DB_PATH = process.env.DATABASE_PATH || './data/pesmetal.db';",
  "const dir = path.dirname(DB_PATH);",
  "if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });",
  '',
  'export const db = new DatabaseSync(DB_PATH);',
  "db.exec('PRAGMA journal_mode = WAL');",
  "db.exec(\"PRAGMA encoding = 'UTF-8'\");",
  "db.exec('PRAGMA foreign_keys = ON');",
  '',
  'export function migrate() {',
  '  db.exec(SCHEMA);',
  '}',
  '',
  'export const SCHEMA = `',
  schema,
  '`;'
].join('\n');

fs.writeFileSync(path.join(ROOT, 'src/lib/db.ts'), template);
console.log('OK, size:', template.length);
