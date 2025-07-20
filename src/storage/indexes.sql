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

-- Полнотекстовый индекс для поиска по названию рецепта
CREATE INDEX IF NOT EXISTS idx_recipes_title_tsv
  ON recipes
  USING GIN (to_tsvector('simple', title));

-- Композитный индекс для фильтрации по языку и сортировки по ID
CREATE INDEX IF NOT EXISTS idx_recipes_lang_id ON recipes(lang, id DESC);

-- 2. Таблица `recipe_ingredients` (Самая важная для производительности)
-- ---------------------------------------------------------------------
-- >> Ключевой композитный индекс. Покрывает:
--    - JOIN'ы с `recipes`.
--    - GROUP BY по `recipe_id` для подсчетов.
--    - Фильтрацию по `ingredient_id`.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON recipe_ingredients(recipe_id, ingredient_id);

-- Дополнительные индексы для ускорения фильтрации по множеству ингредиентов и тегов
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);

-- Индекс для ускорения GROUP BY и подсчётов
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Частичный индекс для рецептов с ингредиентами (ускоряет подсчёты)
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_active ON recipe_ingredients(recipe_id) WHERE ingredient_id IS NOT NULL;

-- 3. Связующие таблицы тегов (Для быстрых `EXISTS` и `JOIN`)
-- ---------------------------------------------------------------------
-- >> Композитные индексы идеальны для быстрой проверки наличия пары (recipe_id, tag_id).
CREATE INDEX IF NOT EXISTS idx_recipe_diets_recipe_diet ON recipe_diets(recipe_id, diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_recipe_meal ON recipe_meal_types(recipe_id, meal_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen ON recipe_kitchens(recipe_id, kitchen_id);

-- Дополнительные индексы для ускорения фильтрации по множеству ингредиентов и тегов
CREATE INDEX IF NOT EXISTS idx_recipe_diets_diet_id ON recipe_diets(diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_meal_type_id ON recipe_meal_types(meal_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_kitchen_id ON recipe_kitchens(kitchen_id);

-- 4. Таблица `saved_recipes` (Для личного кабинета пользователя)
-- ---------------------------------------------------------------------
-- >> Ускоряет `getUserSavedRecipesFast` и другие операции по `userId`.
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user_id ON saved_recipes(user_id);

-- >> Ускоряет `unsaveRecipe` и проверку, сохранил ли пользователь конкретный рецепт.
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user_recipe ON saved_recipes(user_id, recipe_id);

-- 5. Дополнительные оптимизации
-- ---------------------------------------------------------------------
-- Индекс для ускорения поиска по названию с языком
CREATE INDEX IF NOT EXISTS idx_recipes_title_lang ON recipes(title, lang);

-- Индекс для ускорения подсчётов популярности
CREATE INDEX IF NOT EXISTS idx_recipes_viewed ON recipes(viewed DESC);

-- Индекс для ускорения подсчётов использования ингредиентов
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_usage ON recipe_ingredients(ingredient_id, recipe_id);

-- Индексы для оптимизации производительности запросов

-- Индексы для таблицы recipes
CREATE INDEX IF NOT EXISTS idx_recipes_lang ON recipes(lang);
CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at);

-- Индексы для таблицы recipe_ingredients
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient ON recipe_ingredients(recipe_id, ingredient_id);

-- Индексы для таблиц связей с тегами
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_recipe_id ON recipe_meal_types(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_meal_type_id ON recipe_meal_types(meal_type_id);
CREATE INDEX IF NOT EXISTS idx_recipe_meal_types_recipe_meal_type ON recipe_meal_types(recipe_id, meal_type_id);

CREATE INDEX IF NOT EXISTS idx_recipe_diets_recipe_id ON recipe_diets(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_diets_diet_id ON recipe_diets(diet_id);
CREATE INDEX IF NOT EXISTS idx_recipe_diets_recipe_diet ON recipe_diets(recipe_id, diet_id);

CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_recipe_id ON recipe_kitchens(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_kitchen_id ON recipe_kitchens(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen ON recipe_kitchens(recipe_id, kitchen_id);

-- Индексы для таблиц тегов
CREATE INDEX IF NOT EXISTS idx_meal_types_tag ON meal_types(tag);
CREATE INDEX IF NOT EXISTS idx_diets_tag ON diets(tag);
CREATE INDEX IF NOT EXISTS idx_kitchens_tag ON kitchens(tag);

-- Составные индексы для оптимизации фильтрации
CREATE INDEX IF NOT EXISTS idx_recipes_lang_title ON recipes(lang, title);
CREATE INDEX IF NOT EXISTS idx_recipes_lang_created_at ON recipes(lang, created_at); 