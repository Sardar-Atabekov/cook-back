import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URI) {
  throw new Error('POSTGRES_URI is missing in .env');
}

export default defineConfig({
  out: './migrations',
  schema: ['./src/models/**/*.ts'], 
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URI,
  },
});
