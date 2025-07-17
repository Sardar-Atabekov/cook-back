-- =====================================================================
-- ФИНАЛЬНЫЙ И ОПТИМАЛЬНЫЙ НАБОР ИНДЕКСОВ (PostgreSQL)
-- Версия для финального файла recipeStorage.ts
-- =====================================================================

-- 1. Таблица `recipes`
-- ---------------------------------------------------------------------
-- >> Основной индекс для всех фильтров по языку.
CREATE INDEX IF NOT EXISTS idx_recipes_lang ON recipes(lang);

-- >> Ускоряет поиск по названию (поиск по началу строки, например, ILIKE '...%').
CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);


-- 2. Таблица `recipe_ingredients` (Самая важная для производительности)
-- ---------------------------------------------------------------------
-- >> Ключевой композитный индекс. Покрывает:
--    - JOIN'ы с `recipes`.
--    - GROUP BY по `recipe_id` для подсчетов.
--    - Фильтрацию по `ingredient_id`.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON recipe_ingredients(recipe_id, ingredient_id);


-- 3. Связующие таблицы тегов (Для быстрых `EXISTS` и `JOIN`)
-- ---------------------------------------------------------------------
-- >> Композитные индексы идеальны для быстрой проверки наличия пары (recipe_id, tag_id).
CREATE INDEX IF NOT EXISTS idx_recipe_diets_recipe_diet ON recipe_diets(recipe_id, diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_recipe_meal ON recipe_meal_types(recipe_id, meal_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen ON recipe_kitchens(recipe_id, kitchen_id);


-- 4. Таблица `saved_recipes` (Для личного кабинета пользователя)
-- ---------------------------------------------------------------------
-- >> Ускоряет `getUserSavedRecipesFast` и другие операции по `userId`.
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user_id ON saved_recipes(user_id);

-- >> Ускоряет `unsaveRecipe` и проверку, сохранил ли пользователь конкретный рецепт.
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user_recipe ON saved_recipes(user_id, recipe_id);

