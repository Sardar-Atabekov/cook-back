import {
  recipes,
  recipeIngredients,
  ingredients,
  savedRecipes,
  type Recipe,
  type RecipeWithIngredients,
  type RecipeWithIngredientsAndTags,
  type RecipeIngredient,
  type SavedRecipe,
} from '@/models';
import { db } from './db';
import { eq, inArray, sql, and, exists, SQL, count, desc, getTableColumns } from 'drizzle-orm';
import {
  diets,
  kitchens,
  mealTypes,
  recipeDiets,
  recipeKitchens,
  recipeMealTypes,
} from '@/models/schema/tags';

type Tag = {
  id: number;
  tag: string;
  name: string;
  slug: string;
  type: 'meal_type' | 'diet' | 'kitchen';
};

// Вспомогательная функция для получения ингредиентов рецептов
const getIngredientsForRecipes = async (recipeIds: number[]) => {
  if (recipeIds.length === 0) return [];

  return await db
    .select({
      recipeIngredient: recipeIngredients,
      ingredient: ingredients,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds));
};

export const recipeStorage = {
  async getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number,
    lang: string,
    dietTagIds: number[],
    mealTypeIds: number[],
    kitchenIds: number[]
  ): Promise<
    (RecipeWithIngredientsAndTags & {
      matchPercentage: number;
      missingIngredients: RecipeIngredient[];
    })[]
  > {
    // --- Случай 1: Ингредиенты не указаны ---
    // Логика остается похожей, но мы можем немного ее упростить.
    if (!ingredientIds || ingredientIds.length === 0) {
      console.log('Executing simplified query: No ingredients provided.');

      const conditions: SQL[] = [eq(recipes.lang, lang)];

      // Динамически добавляем условия для фильтров по тегам
      if (dietTagIds?.length > 0) {
        conditions.push(
          exists(
            db
              .select({ n: sql`1` })
              .from(recipeDiets)
              .where(
                and(
                  eq(recipeDiets.recipeId, recipes.id),
                  inArray(recipeDiets.dietId, dietTagIds)
                )
              )
          )
        );
      }
      if (mealTypeIds?.length > 0) {
        conditions.push(
          exists(
            db
              .select({ n: sql`1` })
              .from(recipeMealTypes)
              .where(
                and(
                  eq(recipeMealTypes.recipeId, recipes.id),
                  inArray(recipeMealTypes.mealTypeId, mealTypeIds)
                )
              )
          )
        );
      }
      if (kitchenIds?.length > 0) {
        conditions.push(
          exists(
            db
              .select({ n: sql`1` })
              .from(recipeKitchens)
              .where(
                and(
                  eq(recipeKitchens.recipeId, recipes.id),
                  inArray(recipeKitchens.kitchenId, kitchenIds)
                )
              )
          )
        );
      }

      const recipesResult = await db
        .select()
        .from(recipes)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset);

      if (recipesResult.length === 0) {
        return [];
      }

      const recipeIds = recipesResult.map((r) => r.id);

      // Параллельно получаем связанные данные (ингредиенты и теги)
      const [recipeIngredientsResult, { mealTypes, diets, kitchens }] =
        await Promise.all([
          getIngredientsForRecipes(recipeIds),
          getTagsForRecipeIds(recipeIds),
        ]);

      // Собираем финальный результат
      return recipesResult.map((recipe) => ({
        ...recipe,
        recipeIngredients:
          recipeIngredientsResult
            .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
            .map((ri) => ri.recipeIngredient) || [],
        matchPercentage: 0, // Нет ингредиентов для сравнения
        missingIngredients: [],
        mealTypes: mealTypes.get(recipe.id) || [],
        diets: diets.get(recipe.id) || [],
        kitchens: kitchens.get(recipe.id) || [],
      }));
    }

    // --- Случай 2: Ингредиенты указаны (оптимизированный запрос) ---
    console.log('Executing optimized query with ingredient matching.');

    // Подзапрос для подсчета совпадений и общего числа ингредиентов
    const subquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        // Считаем, сколько ингредиентов пользователя есть в рецепте
        matchedCount: count(
          sql`CASE WHEN ${recipeIngredients.ingredientId} IN ${ingredientIds} THEN 1 END`
        ).as('matched_count'),
        // Считаем общее количество ингредиентов в рецепте
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('subquery');

    // Основной запрос, который объединяет все вместе
    const conditions: SQL[] = [
      eq(recipes.lang, lang),
      // Отбираем только те рецепты, где есть хотя бы одно совпадение
      sql`${subquery.matchedCount} > 0`,
    ];

    // Динамически добавляем фильтры по тегам
    if (dietTagIds?.length > 0) {
      conditions.push(
        exists(
          db
            .select({ n: sql`1` })
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }
    // ... (аналогичные блоки для mealTypeIds и kitchenIds) ...
    if (mealTypeIds?.length > 0) {
      conditions.push(
        exists(
          db
            .select({ n: sql`1` })
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }
    if (kitchenIds?.length > 0) {
      conditions.push(
        exists(
          db
            .select({ n: sql`1` })
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    // Вычисляем процент совпадения прямо в запросе
    const matchPercentage =
      sql<number>`ROUND((${subquery.matchedCount} * 100.0) / ${subquery.totalCount})`.as(
        'matchPercentage'
      );

    const recipesResult = await db
      .select({
        ...getTableColumns(recipes), // Выбираем все колонки из таблицы recipes
        matchPercentage,
      })
      .from(recipes)
      .innerJoin(subquery, eq(recipes.id, subquery.recipeId))
      .where(and(...conditions))
      .orderBy(desc(matchPercentage)) // Сортируем по проценту совпадения
      .limit(limit)
      .offset(offset);

    if (recipesResult.length === 0) {
      return [];
    }

    const recipeIds = recipesResult.map((r) => r.id);

    // Параллельно получаем связанные данные для найденных рецептов
    const [recipeIngredientsResult, { mealTypes, diets, kitchens }] =
      await Promise.all([
        getIngredientsForRecipes(recipeIds),
        getTagsForRecipeIds(recipeIds),
      ]);

    // Собираем финальный результат
    return recipesResult.map((recipe) => {
      const allIngredients =
        recipeIngredientsResult
          .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
          .map((ri) => ri.recipeIngredient) || [];

      // Разделяем ингредиенты на недостающие и имеющиеся
      const missingIngredients = allIngredients.filter(
        (ing) => !ingredientIds.includes(ing.ingredientId!)
      );

      return {
        ...recipe,
        recipeIngredients: allIngredients,
        missingIngredients,
        mealTypes: mealTypes.get(recipe.id) || [],
        diets: diets.get(recipe.id) || [],
        kitchens: kitchens.get(recipe.id) || [],
      };
    });
  },

  async getRecipeById(
    id: number,
    ingredientIds: number[]
  ): Promise<
    | (RecipeWithIngredientsAndTags & {
        matchPercentage: number;
        missingIngredients: RecipeIngredient[];
      })
    | undefined
  > {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));

    if (!recipe) return undefined;

    // Получаем сам рецепт
    const {
      mealTypes: tagMapMealTypes,
      diets: tagMapDiets,
      kitchens: tagMapKitchens,
    } = await getTagsForRecipeIds([recipe.id]);

    // Получаем ингредиенты этого рецепта
    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(eq(recipeIngredients.recipeId, id));

    const recipeIngr = recipeIngredientsResult.map((ri) => ri.recipeIngredient);

    // Только валидные ingredientId
    const validRecipeIngredients = recipeIngr.filter(
      (ri) => typeof ri.ingredientId === 'number' && !isNaN(ri.ingredientId)
    );

    const matched = validRecipeIngredients.filter((ri) =>
      ingredientIds.includes(Number(ri.ingredientId))
    );

    const missing = validRecipeIngredients.filter(
      (ri) => !ingredientIds.includes(Number(ri.ingredientId))
    );

    const matchPercentage =
      validRecipeIngredients.length > 0
        ? Math.round((matched.length / validRecipeIngredients.length) * 100)
        : 0;

    return {
      ...recipe,
      recipeIngredients: recipeIngr,
      matchPercentage,
      missingIngredients: missing,
      mealTypes: tagMapMealTypes.get(recipe.id) || [],
      diets: tagMapDiets.get(recipe.id) || [],
      kitchens: tagMapKitchens.get(recipe.id) || [],
    };
  },

  async searchRecipes(
    query: string,
    lang: string,
    ingredientIds: number[],
    limit: number,
    offset: number,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<
    (RecipeWithIngredientsAndTags & {
      matchPercentage: number;
      missingIngredients: RecipeIngredient[];
    })[]
  > {
    // Условия для фильтрации
    const conditions = [
      sql`${recipes.title} ILIKE ${`%${query}%`}`,
      eq(recipes.lang, lang),
    ];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    // Получаем рецепты с поиском и фильтрами
    const recipesResult = await db
      .select()
      .from(recipes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset);

    const recipeIds = recipesResult.map((r) => r.id);

    if (recipeIds.length === 0) {
      return [];
    }

    // Выполняем запросы параллельно для улучшения производительности
    const [recipeIngredientsResult, { mealTypes, diets, kitchens }] =
      await Promise.all([
        getIngredientsForRecipes(recipeIds),
        getTagsForRecipeIds(recipeIds),
      ]);

    return recipesResult.map((recipe) => {
      const recipeIngr = recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ri.recipeIngredient);

      // Только валидные ingredientId
      const validRecipeIngredients = recipeIngr.filter(
        (ri) => typeof ri.ingredientId === 'number' && !isNaN(ri.ingredientId)
      );

      const matched = validRecipeIngredients.filter((ri) =>
        ingredientIds.includes(Number(ri.ingredientId))
      );

      const missing = validRecipeIngredients.filter(
        (ri) => !ingredientIds.includes(Number(ri.ingredientId))
      );

      const matchPercentage =
        validRecipeIngredients.length > 0
          ? Math.round((matched.length / validRecipeIngredients.length) * 100)
          : 0;

      return {
        ...recipe,
        recipeIngredients: recipeIngr,
        matchPercentage,
        missingIngredients: missing,
        mealTypes: mealTypes.get(recipe.id) || [],
        diets: diets.get(recipe.id) || [],
        kitchens: kitchens.get(recipe.id) || [],
      };
    });
  },

  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
  },

  async getAllTags(): Promise<Tag[]> {
    const [mealTypesRaw, dietsRaw, kitchensRaw] = await Promise.all([
      db
        .select({
          id: mealTypes.id,
          tag: mealTypes.tag,
          name: mealTypes.name,
          slug: mealTypes.slug,
        })
        .from(mealTypes),
      db
        .select({
          id: diets.id,
          tag: diets.tag,
          name: diets.name,
          slug: diets.slug,
        })
        .from(diets),
      db
        .select({
          id: kitchens.id,
          tag: kitchens.tag,
          name: kitchens.name,
          slug: kitchens.slug,
        })
        .from(kitchens),
    ]);

    return [
      ...mealTypesRaw.map((t) => ({ ...t, type: 'meal_type' as const })),
      ...dietsRaw.map((t) => ({ ...t, type: 'diet' as const })),
      ...kitchensRaw.map((t) => ({ ...t, type: 'kitchen' as const })),
    ];
  },

  async unsaveRecipe(userId: number, recipeId: number): Promise<void> {
    await db
      .delete(savedRecipes)
      .where(
        and(
          eq(savedRecipes.userId, userId),
          eq(savedRecipes.recipeId, recipeId)
        )
      );
  },

  async getUserSavedRecipes(userId: number): Promise<RecipeWithIngredients[]> {
    const savedRecipesResult = await db
      .select({ recipe: recipes })
      .from(savedRecipes)
      .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
      .where(and(eq(savedRecipes.userId, userId)));

    const recipeIds = savedRecipesResult.map((sr) => sr.recipe.id);
    if (recipeIds.length === 0) return [];

    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(inArray(recipeIngredients.recipeId, recipeIds));

    return savedRecipesResult.map(({ recipe }) => ({
      ...recipe,
      recipeIngredients: recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ri.recipeIngredient),
    }));
  },

  async countRecipes(
    ingredientIds: number[],
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const conditions = [eq(recipes.lang, lang)];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    if (ingredientIds.length === 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(recipes)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return count;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          ...(conditions.length > 0 ? conditions : []),
          inArray(recipeIngredients.ingredientId, ingredientIds)
        )
      );

    return count;
  },

  // Новый метод для подсчета результатов поиска
  async countSearchResults(
    query: string,
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const conditions = [
      sql`${recipes.title} ILIKE ${`%${query}%`}`,
      eq(recipes.lang, lang),
    ];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(recipes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return count;
  },
};

async function getTagsForRecipeIds(recipeIds: number[]) {
  // Выполняем все три запроса параллельно для улучшения производительности
  const [mealTypesRaw, dietsRaw, kitchensRaw] = await Promise.all([
    db
      .select({
        recipeId: recipeMealTypes.recipeId,
        tag: mealTypes.tag,
        name: mealTypes.name,
        slug: mealTypes.slug,
      })
      .from(recipeMealTypes)
      .innerJoin(mealTypes, eq(recipeMealTypes.mealTypeId, mealTypes.id))
      .where(inArray(recipeMealTypes.recipeId, recipeIds)),

    db
      .select({
        recipeId: recipeDiets.recipeId,
        tag: diets.tag,
        name: diets.name,
        slug: diets.slug,
      })
      .from(recipeDiets)
      .innerJoin(diets, eq(recipeDiets.dietId, diets.id))
      .where(inArray(recipeDiets.recipeId, recipeIds)),

    db
      .select({
        recipeId: recipeKitchens.recipeId,
        tag: kitchens.tag,
        name: kitchens.name,
        slug: kitchens.slug,
      })
      .from(recipeKitchens)
      .innerJoin(kitchens, eq(recipeKitchens.kitchenId, kitchens.id))
      .where(inArray(recipeKitchens.recipeId, recipeIds)),
  ]);

  const groupByRecipe = (rows: any[]) => {
    const map = new Map<number, any[]>();
    for (const row of rows) {
      if (!map.has(row.recipeId)) map.set(row.recipeId, []);
      map.get(row.recipeId)!.push({
        tag: row.tag,
        name: row.name,
        slug: row.slug,
      });
    }
    return map;
  };

  return {
    mealTypes: groupByRecipe(mealTypesRaw),
    diets: groupByRecipe(dietsRaw),
    kitchens: groupByRecipe(kitchensRaw),
  };
}
