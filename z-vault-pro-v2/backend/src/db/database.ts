import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { appConfig } from '../config.js';

const dir = path.dirname(appConfig.DATABASE_PATH);
fs.mkdirSync(dir, { recursive: true });

export const db = new Database(appConfig.DATABASE_PATH);

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
db.exec(schema);
