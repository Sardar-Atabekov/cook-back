import { db } from '../storage/db';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

// Получаем __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyIndexes() {
  try {
    console.log('Применение индексов к базе данных...');

    const indexesPath = join(__dirname, '../storage/indexes.sql');
    const indexesSQL = readFileSync(indexesPath, 'utf-8');

    // Разбиваем SQL на отдельные команды
    const commands = indexesSQL
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0);

    for (const command of commands) {
      if (command.trim()) {
        await db.execute(command);
        console.log(
          `Применен индекс: ${command.split(' ').slice(0, 3).join(' ')}...`
        );
      }
    }

    console.log('Все индексы успешно применены!');
  } catch (error) {
    console.error('Ошибка при применении индексов:', error);
  } finally {
    // Закрываем соединение с базой данных
    try {
      // Получаем клиент из drizzle
      const client = (db as any).client;
      if (client && typeof client.end === 'function') {
        await client.end();
        console.log('Соединение с базой данных закрыто');
      }
    } catch (error) {
      console.log('Ошибка при закрытии соединения:', error);
    }
  }
}

applyIndexes();
