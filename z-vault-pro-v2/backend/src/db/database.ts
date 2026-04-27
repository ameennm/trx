import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { appConfig } from '../config.js';

const dir = path.dirname(appConfig.DATABASE_PATH);
fs.mkdirSync(dir, { recursive: true });

export const db = new Database(appConfig.DATABASE_PATH);

const schemaFileName = 'schema.sql';
const possiblePaths = [
  new URL('./' + schemaFileName, import.meta.url),
  path.join(process.cwd(), 'src/db', schemaFileName),
  path.join(process.cwd(), 'backend/src/db', schemaFileName),
  path.join(process.cwd(), 'dist/db', schemaFileName),
];

let schema = '';
let found = false;

for (const p of possiblePaths) {
  try {
    const finalPath = p instanceof URL ? p : p;
    if (fs.existsSync(finalPath)) {
      schema = fs.readFileSync(finalPath, 'utf8');
      found = true;
      break;
    }
  } catch (e) {
    // Continue searching
  }
}

if (!found) {
  throw new Error(`Could not find ${schemaFileName} in any of the expected locations.`);
}

db.exec(schema);
