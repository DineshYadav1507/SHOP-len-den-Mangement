import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const dataDir=path.join(root,'data');
const backupDir=path.join(dataDir,'backups');
fs.mkdirSync(backupDir,{recursive:true});
const dbPath=path.join(dataDir,'khata.db');
if(!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.join(backupDir,`khata-${stamp}.db`);
const db=new Database(dbPath,{readonly:false});
try {
  await db.backup(out);
  console.log(`Backup created: ${out}`);
} finally { db.close(); }
