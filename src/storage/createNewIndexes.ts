import { sql } from 'drizzle-orm';
import { db } from '@/storage/db';

/**
 * Создает новый, оптимизированный набор индексов.
 * Использует 'CREATE INDEX IF NOT EXISTS' для безопасности повторного выполнения.
 */
export async function createNewIndexes() {
  console.log('Starting to create new optimized indexes...');

  const newIndexes = [
    // Для быстрой фильтрации по языку
    `CREATE INDEX IF NOT EXISTS idx_recipes_lang ON recipes(lang)`,

    // Ключевой композитный индекс для поиска по ингредиентам
    `CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON recipe_ingredients(recipe_id, ingredient_id)`,

    // Композитные индексы для быстрой фильтрации по тегам через EXISTS
    `CREATE INDEX IF NOT EXISTS idx_recipe_diets_recipe_diet ON recipe_diets(recipe_id, diet_id)`,
    `CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_recipe_meal ON recipe_meal_types(recipe_id, meal_type_id)`,
    `CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen ON recipe_kitchens(recipe_id, kitchen_id)`,
  ];

  for (const createQuery of newIndexes) {
    try {
      await db.run(sql.raw(createQuery));
      // Извлекаем имя индекса из запроса для логирования
      const indexName = createQuery.split(' ')[4];
      console.log(`Successfully created index: ${indexName}`);
    } catch (error) {
      console.error(`Failed to create index. Query: ${createQuery}. Error: ${error.message}`);
    }
  }

  console.log('Finished creating new indexes.');
}
