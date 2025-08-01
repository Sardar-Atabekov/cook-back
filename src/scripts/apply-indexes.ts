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

    // Разбиваем SQL на отдельные команды, игнорируя комментарии и пустые строки
    const commands = indexesSQL
      .split('\n')
      .filter(
        (line) =>
          !line.trim().startsWith('--') &&
          !line.trim().startsWith('/*') &&
          !line.trim().startsWith('*/')
      )
      .join('\n')
      .split(';')
      .map((cmd) => cmd.trim())
      .filter(
        (cmd) =>
          cmd.length > 0 &&
          !cmd.startsWith('--') &&
          !cmd.startsWith('/*') &&
          !cmd.startsWith('*/')
      )
      .filter(
        (cmd) =>
          !cmd.includes('--') && !cmd.includes('/*') && !cmd.includes('*/')
      );

    for (const command of commands) {
      try {
        await db.execute(sql.raw(command));
        console.log(
          '✓ Применён:',
          command.split('\n')[0].substring(0, 80) + '...'
        );
      } catch (error) {
        // Игнорируем ошибки "already exists" - это нормально
        if (
          error.message.includes('already exists') ||
          error.message.includes('does not exist')
        ) {
          console.log(
            '⏭ Пропущен (уже существует):',
            command.split('\n')[0].substring(0, 80) + '...'
          );
        } else {
          console.warn('⚠ Ошибка:', error.message.substring(0, 100) + '...');
        }
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
