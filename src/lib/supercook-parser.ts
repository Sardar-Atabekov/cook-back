// file: /lib/supercook-sync.ts

import axios from 'axios';
import { db } from '@/storage/db';
import { ingredientCategories, ingredients } from '@/models';
import { sql, eq } from 'drizzle-orm';

// --- ИНТЕРФЕЙСЫ И ТИПЫ ---
interface SupercookIngredient {
  id: number;
  term: string;
  display_name: string;
}
type SupercookApiResponse = Record<string, SupercookIngredient[]>;

/**
 * Получает данные с API Supercook для заданного языка.
 */
async function fetchSupercookData(
  language: string
): Promise<SupercookApiResponse> {
  const url = 'https://d1.supercook.com/dyn/lang_ings';
  const payload = new URLSearchParams({ lang: language, cv: '2' }).toString();
  console.log(`Запрашиваем данные для языка: ${language}...`);
  try {
    const response = await axios.post<SupercookApiResponse>(url, payload, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SyncBot/1.0)' },
    });
    console.log(`Данные для языка '${language}' успешно получены.`);
    return response.data;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `Ошибка при получении данных для языка '${language}':`,
      errorMessage
    );
    throw new Error(`Failed to fetch data for language ${language}`);
  }
}

/**
 * Синхронизирует данные (категории и ингредиенты) для одного конкретного языка.
 * Если записи не существуют, они создаются.
 * Если записи существуют, но перевода для данного языка нет, он добавляется.
 * @param language - Код языка для синхронизации (например, 'ru', 'en').
 */
export async function syncSupercookIngredients(language: string) {
  if (!language) {
    console.error('Язык не указан. Синхронизация отменена.');
    return;
  }

  try {
    // Шаг 1: Получаем свежие данные с API для нужного языка
    const apiData = await fetchSupercookData(language);

    console.log('Начинаем транзакцию для синхронизации...');
    await db.transaction(async (tx) => {
      let categoryIndex = 0; // Используем индекс как "якорь" для категорий

      for (const [categoryName, ingredientsList] of Object.entries(apiData)) {
        const categoryExternalId = categoryIndex;

        // --- Шаг 2: Обработка категорий ---
        // Пытаемся вставить категорию. Если она уже есть (по externalId), ничего не делаем.
        await tx
          .insert(ingredientCategories)
          .values({
            externalId: categoryExternalId,
            names: { [language]: categoryName },
            isActive: true,
          })
          .onConflictDoNothing({ target: ingredientCategories.externalId });

        // Затем добавляем перевод, если его еще нет.
        await tx
          .update(ingredientCategories)
          .set({
            names: sql`${ingredientCategories.names} || '{"${sql.raw(language)}": "${sql.raw(categoryName.replace(/"/g, "''"))}"}'`,
          })
          .where(
            sql`${ingredientCategories.externalId} = ${categoryExternalId} AND ${ingredientCategories.names} ->> ${language} IS NULL`
          );

        // --- Шаг 3: Получаем ID категории из нашей БД для связи ---
        const categoryResult = await tx
          .select({ id: ingredientCategories.id })
          .from(ingredientCategories)
          .where(eq(ingredientCategories.externalId, categoryExternalId));

        if (!categoryResult || categoryResult.length === 0) {
          console.warn(
            `Не удалось найти категорию с externalId ${categoryExternalId}. Пропускаем ее ингредиенты.`
          );
          categoryIndex++;
          continue;
        }
        const dbCategoryId = categoryResult[0].id;

        // --- Шаг 4: Обработка ингредиентов ---
        if (ingredientsList && ingredientsList.length > 0) {
          const ingredientsToUpsert = ingredientsList.map((ing) => ({
            externalId: String(ing.id),
            primaryName: ing.term,
            names: { [language]: ing.display_name },
            categoryId: dbCategoryId,
            isActive: true,
          }));

          // Вставляем или обновляем ингредиенты порциями
          const chunkSize = 250;
          for (let i = 0; i < ingredientsToUpsert.length; i += chunkSize) {
            const chunk = ingredientsToUpsert.slice(i, i + chunkSize);

            // Сначала вставляем новые ингредиенты
            await tx
              .insert(ingredients)
              .values(chunk)
              .onConflictDoNothing({ target: ingredients.externalId });

            // Затем обновляем переводы для существующих
            for (const item of chunk) {
              await tx
                .update(ingredients)
                .set({
                  names: sql`${ingredients.names} || '{"${sql.raw(language)}": "${sql.raw(item.names[language].replace(/"/g, "''"))}"}'`,
                })
                .where(
                  sql`${ingredients.externalId} = ${item.externalId} AND ${ingredients.names} ->> ${language} IS NULL`
                );
            }
          }
        }
        categoryIndex++;
      }
    });

    console.log(`Синхронизация для языка '${language}' успешно завершена!`);
  } catch (error) {
    console.error(
      `Произошла критическая ошибка во время синхронизации для языка '${language}':`,
      error
    );
  }
}
