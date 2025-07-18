import { db } from '../storage/db';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'url';

// Получаем __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyIndexes() {
  try {
    console.log('Применяем индексы для оптимизации...');

    const indexesPath = join(__dirname, '../storage/indexes.sql');
    const indexesSQL = readFileSync(indexesPath, 'utf-8');

    // Разбиваем SQL на отдельные команды
    const commands = indexesSQL
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0 && !cmd.startsWith('--'));

    for (const command of commands) {
      try {
        await db.execute(sql.raw(command));
        console.log('✓ Применён индекс:', command.split('\n')[0]);
      } catch (error) {
        console.warn('⚠ Ошибка при применении индекса:', error.message);
      }
    }

    console.log('✅ Все индексы применены');
  } catch (error) {
    console.error('❌ Ошибка при применении индексов:', error);
  } finally {
    process.exit(0);
  }
}

applyIndexes();
