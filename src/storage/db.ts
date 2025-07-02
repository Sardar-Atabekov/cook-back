import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URI) {
  throw new Error('Missing POSTGRES_URI in environment');
}

const client = new Client({
  connectionString: process.env.POSTGRES_URI,
});

await client.connect();

export const db = drizzle(client);
