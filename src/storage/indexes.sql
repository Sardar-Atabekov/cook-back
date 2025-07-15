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