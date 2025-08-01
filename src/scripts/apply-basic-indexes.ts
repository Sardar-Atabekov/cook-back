import { db } from '../storage/db';
import { sql } from 'drizzle-orm';

async function applyBasicIndexes() {
  try {
    console.log('🚀 Применяем основные индексы для оптимизации...');

    const basicIndexes = [
      // Основные индексы для recipes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_id_desc ON recipes(lang, id DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_title_lower ON recipes(lang, lower(title) text_pattern_ops)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_rating_desc ON recipes(lang, rating DESC NULLS LAST)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_created_desc ON recipes(lang, created_at DESC NULLS LAST)',

      // Индексы для recipe_ingredients
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON recipe_ingredients(recipe_id, ingredient_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_ingredient_recipe ON recipe_ingredients(ingredient_id, recipe_id)',

      // Индексы для связующих таблиц
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_diets_recipe_diet ON recipe_diets(recipe_id, diet_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_meal_types_recipe_meal ON recipe_meal_types(recipe_id, meal_type_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen ON recipe_kitchens(recipe_id, kitchen_id)',

      // Индексы для saved_recipes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_recipes_user_recipe ON saved_recipes(user_id, recipe_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_recipes_recipe_user ON saved_recipes(recipe_id, user_id)',
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const indexSQL of basicIndexes) {
      try {
        await db.execute(sql.raw(indexSQL));
        console.log(
          `✅ Применён: ${indexSQL.split(' ').slice(0, 6).join(' ')}...`
        );
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(
            `⏭ Пропущен (уже существует): ${indexSQL.split(' ').slice(0, 6).join(' ')}...`
          );
        } else {
          console.warn(`⚠ Ошибка: ${error.message.substring(0, 100)}...`);
          errorCount++;
        }
      }
    }

    console.log('\n🎉 Применение основных индексов завершено!');
    console.log(`✅ Успешно применено: ${successCount} индексов`);
    console.log(`❌ Ошибок: ${errorCount}`);
  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

applyBasicIndexes().catch(console.error);
