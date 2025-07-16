import { sql } from 'drizzle-orm';
import { db } // Предполагается, что ваш экземпляр Drizzle DB импортируется так

/**
 * Удаляет старый набор индексов из базы данных.
 * Безопасно пропускает ошибки, если индекс не существует.
 */
export async function dropOldIndexes() {
  console.log('Starting to drop old indexes...');

  const indexesToDrop = [
    // Индексы для recipes
    'idx_recipes_lang',
    'idx_recipes_title',
    'idx_recipes_created_at',
    'idx_recipes_lang_title',
    'idx_recipes_lang_created_at',

    // Индексы для recipe_ingredients
    'idx_recipe_ingredients_recipe_id',
    'idx_recipe_ingredients_ingredient_id',
    'idx_recipe_ingredients_recipe_ingredient',

    // Индексы для recipe_meal_types
    'idx_recipe_meal_types_recipe_id',
    'idx_recipe_meal_types_meal_type_id',
    'idx_recipe_meal_types_recipe_meal_type',
    'idx_recipe_meal_types_recipe_meal', // Добавил и этот, так как он есть в вашем новом списке

    // Индексы для recipe_diets
    'idx_recipe_diets_recipe_id',
    'idx_recipe_diets_diet_id',
    'idx_recipe_diets_recipe_diet',

    // Индексы для recipe_kitchens
    'idx_recipe_kitchens_recipe_id',
    'idx_recipe_kitchens_kitchen_id',
    'idx_recipe_kitchens_recipe_kitchen',

    // Индексы для таблиц тегов
    'idx_meal_types_tag',
    'idx_diets_tag',
    'idx_kitchens_tag',
  ];

  for (const indexName of indexesToDrop) {
    try {
      // Используем db.run для выполнения сырого SQL
      await db.run(sql.raw(`DROP INDEX IF EXISTS ${indexName}`));
      console.log(`Successfully dropped index: ${indexName}`);
    } catch (error) {
      // Ошибки могут возникать, если индекс не существует, что нормально.
      console.warn(`Could not drop index ${indexName}. It might not exist. Error: ${error.message}`);
    }
  }

  console.log('Finished dropping old indexes.');
}
