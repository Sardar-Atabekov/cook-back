import {
  recipes,
  recipeIngredients,
  ingredients,
  savedRecipes,
  type Recipe,
  type RecipeWithIngredientsAndTags,
  type RecipeIngredient,
  type SavedRecipe,
  diets,
  kitchens,
  mealTypes,
  recipeDiets,
  recipeKitchens,
  recipeMealTypes,
} from '@/models';
import { db } from './db';
import {
  eq,
  inArray,
  sql,
  and,
  exists,
  SQL,
  count,
  desc,
  asc,
  getTableColumns,
  ilike,
} from 'drizzle-orm';
import { cache } from './redis';

// =================================================================
// Типы данных для "быстрых" ответов
// =================================================================
// "Быстрый" ответ содержит все поля из таблицы Recipe + данные по ингредиентам
type FastRecipeResponse = Recipe & {
  matchedCount: number;
  totalCount: number;
  matchPercentage: number;
};

// =================================================================
// Вспомогательные функции (Helpers)
// =================================================================

/**
 * Собирает массив SQL-условий для фильтрации по тегам.
 */
const buildTagFilterConditions = (
  dietTagIds?: number[],
  mealTypeIds?: number[],
  kitchenIds?: number[]
): SQL[] => {
  const conditions: SQL[] = [];
  const addCondition = (table: any, column: any, ids?: number[]) => {
    if (ids?.length) {
      conditions.push(
        exists(
          db
            .select({ n: sql`1` })
            .from(table)
            .where(and(eq(table.recipeId, recipes.id), inArray(column, ids)))
        )
      );
    }
  };
  addCondition(recipeDiets, recipeDiets.dietId, dietTagIds);
  addCondition(recipeMealTypes, recipeMealTypes.mealTypeId, mealTypeIds);
  addCondition(recipeKitchens, recipeKitchens.kitchenId, kitchenIds);
  return conditions;
};

// Batch-функция для получения ингредиентов по списку recipeIds
async function getIngredientsForRecipeIds(recipeIds: number[]) {
  if (!recipeIds.length) return new Map();
  const rows = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      ingredient: ingredients,
      recipeIngredient: recipeIngredients,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds));
  const map = new Map<number, any[]>();
  for (const row of rows) {
    if (!map.has(row.recipeId)) map.set(row.recipeId, []);
    const recipeIngredients = map.get(row.recipeId);
    if (recipeIngredients) {
      recipeIngredients.push({ ...row.ingredient, ...row.recipeIngredient });
    }
  }
  return map;
}

// Batch-функция для получения тегов по списку recipeIds
async function getTagsForRecipeIds(recipeIds: number[]) {
  if (!recipeIds.length)
    return { mealTypes: new Map(), diets: new Map(), kitchens: new Map() };
  // mealTypes
  const mealTypeRows = await db
    .select({
      recipeId: recipeMealTypes.recipeId,
      tagId: recipeMealTypes.mealTypeId,
      tag: mealTypes,
    })
    .from(recipeMealTypes)
    .innerJoin(mealTypes, eq(recipeMealTypes.mealTypeId, mealTypes.id))
    .where(inArray(recipeMealTypes.recipeId, recipeIds));
  const mealTypesMap = new Map<number, any[]>();
  for (const row of mealTypeRows) {
    if (row.recipeId === null) continue;
    if (!mealTypesMap.has(row.recipeId)) mealTypesMap.set(row.recipeId, []);
    const mealTypes = mealTypesMap.get(row.recipeId);
    if (mealTypes) {
      mealTypes.push(row.tag);
    }
  }
  // diets
  const dietRows = await db
    .select({
      recipeId: recipeDiets.recipeId,
      tagId: recipeDiets.dietId,
      tag: diets,
    })
    .from(recipeDiets)
    .innerJoin(diets, eq(recipeDiets.dietId, diets.id))
    .where(inArray(recipeDiets.recipeId, recipeIds));
  const dietsMap = new Map<number, any[]>();
  for (const row of dietRows) {
    if (row.recipeId === null) continue;
    if (!dietsMap.has(row.recipeId)) dietsMap.set(row.recipeId, []);
    const diets = dietsMap.get(row.recipeId);
    if (diets) {
      diets.push(row.tag);
    }
  }
  // kitchens
  const kitchenRows = await db
    .select({
      recipeId: recipeKitchens.recipeId,
      tagId: recipeKitchens.kitchenId,
      tag: kitchens,
    })
    .from(recipeKitchens)
    .innerJoin(kitchens, eq(recipeKitchens.kitchenId, kitchens.id))
    .where(inArray(recipeKitchens.recipeId, recipeIds));
  const kitchensMap = new Map<number, any[]>();
  for (const row of kitchenRows) {
    if (row.recipeId === null) continue;
    if (!kitchensMap.has(row.recipeId)) kitchensMap.set(row.recipeId, []);
    const kitchens = kitchensMap.get(row.recipeId);
    if (kitchens) {
      kitchens.push(row.tag);
    }
  }
  return { mealTypes: mealTypesMap, diets: dietsMap, kitchens: kitchensMap };
}

// =================================================================
// Основной объект recipeStorage
// =================================================================

export const recipeStorage = {
  /**
   * @description Оптимизированный метод для получения списков рецептов.
   * Объединяет получение данных и подсчёт в один запрос.
   */
  async getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number,
    lang: string,
    dietTagIds: number[],
    mealTypeIds: number[],
    kitchenIds: number[]
  ): Promise<FastRecipeResponse[]> {
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);

    // Базовые условия
    const baseConditions = [eq(recipes.lang, lang), ...tagConditions];

    if (!ingredientIds?.length) {
      // Простой случай без фильтрации по ингредиентам
      const result = await db
        .select({
          ...selectFields,
          matchedCount: sql<number>`0`.as('matchedCount'),
          totalCount: sql<number>`0`.as('totalCount'),
          matchPercentage: sql<number>`0`.as('matchPercentage'),
        })
        .from(recipes)
        .where(and(...baseConditions))
        .orderBy(desc(recipes.id))
        .limit(limit)
        .offset(offset);

      return result;
    }

    // Оптимизированный запрос с подсчётом ингредиентов
    const ingredientStats = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, ingredientIds)} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredient_stats');

    const matchPercentage = sql<number>`ROUND((${ingredientStats.matchedCount} * 100.0) / NULLIF(${ingredientStats.totalCount}, 0))`;

    // Получаем рецепты с процентом совпадения
    const recipesResult = await db
      .select({
        ...selectFields,
        matchedCount:
          sql<number>`COALESCE(${ingredientStats.matchedCount}, 0)`.as(
            'matchedCount'
          ),
        totalCount: sql<number>`COALESCE(${ingredientStats.totalCount}, 0)`.as(
          'totalCount'
        ),
        matchPercentage: sql<number>`COALESCE(${matchPercentage}, 0)`.as(
          'matchPercentage'
        ),
      })
      .from(recipes)
      .leftJoin(ingredientStats, eq(recipes.id, ingredientStats.recipeId))
      .where(
        and(
          ...baseConditions,
          // Только рецепты с совпадениями (не null)
          sql`COALESCE(${ingredientStats.matchedCount}, 0) > 0`,
          sql`COALESCE(${ingredientStats.totalCount}, 0) > 0`
        )
      )
      .orderBy(desc(matchPercentage), desc(recipes.id))
      .limit(limit)
      .offset(offset);

    return recipesResult;
  },

  /**
   * @description Оптимизированный метод для поиска рецептов.
   */
  async searchRecipes(
    query: string,
    lang: string,
    ingredientIds: number[],
    limit: number,
    offset: number,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<FastRecipeResponse[]> {
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);

    const baseConditions = [
      ilike(recipes.title, `%${query}%`),
      eq(recipes.lang, lang),
      ...tagConditions,
    ];

    // Всегда ищем только по названию, ингредиенты только для % совпадения
    const ingredientStats = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, ingredientIds)} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredient_stats');

    const matchPercentage = sql<number>`ROUND((${ingredientStats.matchedCount} * 100.0) / NULLIF(${ingredientStats.totalCount}, 0))`;

    return db
      .select({
        ...selectFields,
        matchedCount:
          sql<number>`COALESCE(${ingredientStats.matchedCount}, 0)`.as(
            'matchedCount'
          ),
        totalCount: sql<number>`COALESCE(${ingredientStats.totalCount}, 0)`.as(
          'totalCount'
        ),
        matchPercentage: sql<number>`COALESCE(${matchPercentage}, 0)`.as(
          'matchPercentage'
        ),
      })
      .from(recipes)
      .leftJoin(ingredientStats, eq(recipes.id, ingredientStats.recipeId))
      .where(and(...baseConditions))
      .orderBy(desc(recipes.id))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Быстрый полнотекстовый поиск по названию рецепта (использует GIN-индекс)
   */
  async fullTextSearchRecipes(
    query: string,
    lang: string,
    ingredientIds: number[],
    limit: number,
    offset: number,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<FastRecipeResponse[]> {
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);
    // Полнотекстовый поиск по title
    const conditions = [
      sql`to_tsvector('simple', ${recipes.title}) @@ plainto_tsquery('simple', ${query})`,
      eq(recipes.lang, lang),
      ...tagConditions,
    ];
    // Subquery для matchPercentage
    const ingredientMatchSubquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, ingredientIds)} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredientMatchSubquery');
    const matchPercentage = sql<number>`ROUND((${ingredientMatchSubquery.matchedCount} * 100.0) / NULLIF(${ingredientMatchSubquery.totalCount}, 0))`;
    return db
      .select({
        ...selectFields,
        matchedCount:
          sql<number>`COALESCE(${ingredientMatchSubquery.matchedCount}, 0)`.as(
            'matchedCount'
          ),
        totalCount:
          sql<number>`COALESCE(${ingredientMatchSubquery.totalCount}, 0)`.as(
            'totalCount'
          ),
        matchPercentage: sql<number>`COALESCE(${matchPercentage}, 0)`.as(
          'matchPercentage'
        ),
      })
      .from(recipes)
      .leftJoin(
        ingredientMatchSubquery,
        eq(recipes.id, ingredientMatchSubquery.recipeId)
      )
      .where(and(...conditions))
      .orderBy(desc(recipes.id))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Быстрый поиск рецептов, которые содержат все указанные ингредиенты (использует индекс по ingredient_id)
   */
  async findRecipesByAllIngredients(
    ingredientIds: number[],
    limit: number,
    offset: number,
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<FastRecipeResponse[]> {
    if (!ingredientIds.length) return [];
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);
    // Находим recipe_id, которые содержат все ингредиенты
    const subquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
      })
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.ingredientId, ingredientIds))
      .groupBy(recipeIngredients.recipeId)
      .having(
        sql`COUNT(DISTINCT ${recipeIngredients.ingredientId}) = ${ingredientIds.length}`
      )
      .as('matched_recipes');
    return db
      .select({
        ...selectFields,
        matchedCount: sql<number>`${ingredientIds.length}`.as('matchedCount'),
        totalCount: sql<number>`${ingredientIds.length}`.as('totalCount'),
        matchPercentage: sql<number>`100`.as('matchPercentage'),
      })
      .from(recipes)
      .innerJoin(subquery, eq(recipes.id, subquery.recipeId))
      .where(and(eq(recipes.lang, lang), ...tagConditions))
      .orderBy(desc(recipes.id))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Поиск рецептов, где все ингредиенты рецепта содержатся в списке пользователя (user covers recipe)
   */
  async findRecipesUserCoversAll(
    userIngredientIds: number[],
    limit: number,
    offset: number,
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<FastRecipeResponse[]> {
    if (!userIngredientIds.length) return [];
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);
    // Для каждого рецепта считаем, сколько его ингредиентов есть у пользователя
    // и сравниваем с общим числом ингредиентов в рецепте
    const subquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, userIngredientIds)} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('subquery');
    return db
      .select({
        ...selectFields,
        matchedCount: sql<number>`COALESCE(${subquery.matchedCount}, 0)`.as(
          'matchedCount'
        ),
        totalCount: sql<number>`COALESCE(${subquery.totalCount}, 0)`.as(
          'totalCount'
        ),
      })
      .from(recipes)
      .innerJoin(subquery, eq(recipes.id, subquery.recipeId))
      .where(
        and(
          eq(recipes.lang, lang),
          sql`${subquery.matchedCount} = ${subquery.totalCount}`,
          ...tagConditions
        )
      )
      .orderBy(desc(recipes.id))
      .limit(limit)
      .offset(offset);
  },

  /**
   * @description МАКСИМАЛЬНО БЫСТРЫЙ метод для получения сохраненных рецептов пользователя.
   * Возвращает все поля рецепта.
   */
  async getUserSavedRecipes(
    userId: number,
    limit: number,
    offset: number
  ): Promise<Recipe[]> {
    return db
      .select(getTableColumns(recipes))
      .from(savedRecipes)
      .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
      .where(eq(savedRecipes.userId, userId))
      .orderBy(desc(savedRecipes.createdAt), asc(recipes.id)) // Стабильная сортировка
      .limit(limit)
      .offset(offset);
  },

  /**
   * @description Получает ПОЛНУЮ информацию для ОДНОГО рецепта и атомарно увеличивает счетчик просмотров.
   */
  async getRecipeById(
    id: number,
    ingredientIds: number[] = []
  ): Promise<
    | (RecipeWithIngredientsAndTags & {
        matchPercentage: number;
        missingIngredients: RecipeIngredient[];
      })
    | undefined
  > {
    // Получаем рецепт
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    // Получаем ингредиенты и теги batch-запросами
    const [ingredientsMap, tags] = await Promise.all([
      getIngredientsForRecipeIds([id]),
      getTagsForRecipeIds([id]),
    ]);
    const recipeIngredients = ingredientsMap.get(id) || [];
    const validIngredients = recipeIngredients.filter(
      (ing) => ing.ingredientId != null
    );
    const matchedIngredients = validIngredients.filter((ing) =>
      ingredientIds.includes(ing.ingredientId)
    );
    const missingIngredients = validIngredients.filter(
      (ing) => !ingredientIds.includes(ing.ingredientId)
    );
    const matchPercentage =
      validIngredients.length > 0
        ? Math.round(
            (matchedIngredients.length / validIngredients.length) * 100
          )
        : 0;

    return {
      ...recipe,
      recipeIngredients,
      matchPercentage,
      missingIngredients,
      mealTypes: tags.mealTypes.get(id) || [],
      diets: tags.diets.get(id) || [],
      kitchens: tags.kitchens.get(id) || [],
    };
  },

  /**
   * @description Оптимизированный подсчёт рецептов.
   */
  async countRecipes(
    ingredientIds: number[],
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );

    if (!ingredientIds?.length) {
      const [{ value }] = await db
        .select({ value: count() })
        .from(recipes)
        .where(and(eq(recipes.lang, lang), ...tagConditions));
      return value;
    }

    // Подсчёт рецептов с 100% совпадением ингредиентов
    const ingredientStats = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, ingredientIds)} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredient_stats');

    const [{ value }] = await db
      .select({ value: count() })
      .from(recipes)
      .innerJoin(ingredientStats, eq(recipes.id, ingredientStats.recipeId))
      .where(
        and(
          eq(recipes.lang, lang),
          // Только рецепты с 100% совпадением
          sql`${ingredientStats.matchedCount} = ${ingredientStats.totalCount}`,
          sql`${ingredientStats.totalCount} > 0`,
          ...tagConditions
        )
      );

    return value;
  },

  /**
   * @description Оптимизированный подсчёт результатов поиска.
   */
  async countSearchResults(
    query: string,
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );

    const [{ value }] = await db
      .select({ value: count() })
      .from(recipes)
      .where(
        and(
          ilike(recipes.title, `%${query}%`),
          eq(recipes.lang, lang),
          ...tagConditions
        )
      );
    return value;
  },

  /**
   * @description Сохраняет рецепт для пользователя.
   */
  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
  },

  /**
   * @description Удаляет рецепт из сохраненных у пользователя.
   */
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

  /**
   * @description Получает все существующие теги.
   */
  async getAllTags() {
    const [mealTypesData, dietsData, kitchensData] = await Promise.all([
      db.select().from(mealTypes),
      db.select().from(diets),
      db.select().from(kitchens),
    ]);
    return [
      ...mealTypesData.map((t) => ({ ...t, type: 'meal_type' as const })),
      ...dietsData.map((t) => ({ ...t, type: 'diet' as const })),
      ...kitchensData.map((t) => ({ ...t, type: 'kitchen' as const })),
    ];
  },

  /**
   * Получить топ-N популярных рецептов по просмотрам (кэшируется на 1 час)
   */
  async getPopularRecipes(limit: number = 10) {
    const cacheKey = `popular_recipes:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const recipes = await db
      .select(getTableColumns(recipes))
      .from(recipes)
      .orderBy(desc(recipes.viewed))
      .limit(limit);
    await cache.setex(cacheKey, 3600, JSON.stringify(recipes));
    return recipes;
  },

  /**
   * Получить топ-N популярных ингредиентов по частоте использования (кэшируется на 6 часов)
   */
  async getPopularIngredients(limit: number = 20) {
    const cacheKey = `popular_ingredients:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const rows = await db
      .select({
        ingredientId: recipeIngredients.ingredientId,
        count: count().as('usage_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.ingredientId)
      .orderBy(desc(sql`usage_count`))
      .limit(limit);
    const ingredientIds = rows.map((r) => r.ingredientId);
    const ingredientsList = await db
      .select()
      .from(ingredients)
      .where(inArray(ingredients.id, ingredientIds));
    // Сортируем по usage_count
    const idToIngredient = new Map(ingredientsList.map((i) => [i.id, i]));
    const result = rows.map((r) => ({
      ...idToIngredient.get(r.ingredientId),
      usageCount: r.count,
    }));
    await cache.setex(cacheKey, 21600, JSON.stringify(result));
    return result;
  },
};

export { getIngredientsForRecipeIds, getTagsForRecipeIds };
