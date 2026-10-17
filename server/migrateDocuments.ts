import { db, pool } from './db';
import { migrateDocumentObjects } from './repositories/actsRepo';
if (!process.env.DOCUMENT_OBJECT_DIR) throw new Error('Set DOCUMENT_OBJECT_DIR to a persistent private volume before migration');
try { console.log(await migrateDocumentObjects(db)); } finally { await pool.end(); }
