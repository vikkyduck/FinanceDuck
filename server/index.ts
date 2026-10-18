import { createApp } from './app';
import { db } from './db';
import { migrateAccessCodesAtRest } from './repositories/userRepo';
const app = createApp();

// Разовая идемпотентная миграция кодов доступа «в сейф» (когда задан секрет).
// Не блокирует старт и не валит сервер при ошибке — вход и так работает.
migrateAccessCodesAtRest(db)
  .then(n => { if (n) console.log(`[accessCode] зашифровано кодов при старте: ${n}`); })
  .catch(e => console.error("[accessCode] миграция при старте не удалась (вход работает):", (e as Error)?.message));

export { app };
