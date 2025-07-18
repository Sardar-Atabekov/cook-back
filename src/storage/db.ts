import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URI) {
  throw new Error('Missing POSTGRES_URI in environment');
}

let client: Client;
let db: ReturnType<typeof drizzle>;

// Обёртка для логирования медленных SQL-запросов
function wrapDbWithLogging(db: any) {
  const handler = {
    get(target: any, prop: string) {
      const orig = target[prop];
      if (typeof orig === 'function') {
        return async function (...args: any[]) {
          const start = Date.now();
          const result = await orig.apply(target, args);
          const duration = Date.now() - start;
          if (duration > 300) {
            // Попробуем получить SQL-текст (для drizzle это может быть .toSQL() или .sql)
            let sqlText = '';
            if (args[0] && typeof args[0] === 'object' && args[0].toSQL) {
              sqlText = args[0].toSQL().sql;
            } else if (args[0] && typeof args[0] === 'string') {
              sqlText = args[0];
            }
            console.warn(
              `[SLOW SQL >300ms] ${duration}ms :: ${prop} :: ${sqlText}`
            );
            if (duration > 1000) {
              console.error(
                `[ALERT: SLOW SQL >1s] ${duration}ms :: ${prop} :: ${sqlText}`
              );
            }
          }
          return result;
        };
      }
      return orig;
    },
  };
  return new Proxy(db, handler);
}

async function connectWithRetry(retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      client = new Client({
        connectionString: process.env.POSTGRES_URI,
      });

      client.on('error', async (err) => {
        console.error('Postgres connection error:', err);
        // Попытка переподключения
        await reconnect();
      });

      await client.connect();
      db = drizzle(client) as any;
      // db = wrapDbWithLogging(db);
      console.log('Postgres connected');
      return;
    } catch (err) {
      console.error(`Postgres connect failed (attempt ${i + 1}):`, err);
      if (i < retries - 1) {
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

async function reconnect() {
  try {
    await client.end().catch(() => {});
  } catch {}
  await connectWithRetry();
}

await connectWithRetry();

export { db };
