import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { appConfig } from '../config.js';

const dir = path.dirname(appConfig.DATABASE_PATH);
fs.mkdirSync(dir, { recursive: true });

export const db = new Database(appConfig.DATABASE_PATH);

const sourceSchemaPath = new URL('./schema.sql', import.meta.url);
const fallbackSchemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
const schemaPath = fs.existsSync(sourceSchemaPath) ? sourceSchemaPath : fallbackSchemaPath;
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);
