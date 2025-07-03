import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URI) {
  throw new Error('Missing POSTGRES_URI in environment');
}

let client: Client;
let db: ReturnType<typeof drizzle>;

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
      db = drizzle(client);
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
