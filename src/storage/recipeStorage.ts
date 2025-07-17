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

// =================================================================
// Основной объект recipeStorage
// =================================================================

export const recipeStorage = {
  /**
   * @description МАКСИМАЛЬНО БЫСТРЫЙ метод для получения списков рецептов по ингредиентам.
   * Возвращает все поля рецепта и данные по ингредиентам. Гарантирует стабильную пагинацию.
   * Выполняет ОДИН запрос к БД.
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

    const totalCountSubquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('totalCountSubquery');

    if (!ingredientIds?.length) {
      const conditions = [eq(recipes.lang, lang), ...tagConditions];
      return db
        .select({
          ...selectFields,
          matchedCount: sql<number>`0`.as('matchedCount'),
          totalCount:
            sql<number>`COALESCE(${totalCountSubquery.totalCount}, 0)`.as(
              'totalCount'
            ),
          matchPercentage: sql<number>`0`.as('matchPercentage'),
        })
        .from(recipes)
        .leftJoin(
          totalCountSubquery,
          eq(recipes.id, totalCountSubquery.recipeId)
        )
        .where(and(...conditions))
        .orderBy(desc(recipes.id))
        .limit(limit)
        .offset(offset);
    }

    const subquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${recipeIngredients.ingredientId} IN ${ingredientIds} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('subquery');

    const matchPercentage = sql<number>`ROUND((${subquery.matchedCount} * 100.0) / NULLIF(${subquery.totalCount}, 0))`;

    // Fetch 100% matched recipes first
    const perfectMatchRecipes = await db
      .select({
        ...selectFields,
        matchedCount: sql<number>`${subquery.matchedCount}`.as('matchedCount'),
        totalCount: sql<number>`${subquery.totalCount}`.as('totalCount'),
        matchPercentage: matchPercentage.as('matchPercentage'),
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
      .orderBy(desc(matchPercentage), asc(recipes.id))
      .limit(limit)
      .offset(offset);

    // If we have enough perfect matches, return them
    if (perfectMatchRecipes.length === limit) {
      return perfectMatchRecipes;
    }

    // Otherwise, get remaining recipes with at least one match, ordered by match percentage
    const partialMatchOffset = Math.max(0, offset - perfectMatchRecipes.length);
    const partialMatchLimit = limit - perfectMatchRecipes.length;

    const partialMatchRecipes = await db
      .select({
        ...selectFields,
        matchedCount: sql<number>`${subquery.matchedCount}`.as('matchedCount'),
        totalCount: sql<number>`${subquery.totalCount}`.as('totalCount'),
        matchPercentage: matchPercentage.as('matchPercentage'),
      })
      .from(recipes)
      .innerJoin(subquery, eq(recipes.id, subquery.recipeId))
      .where(
        and(
          eq(recipes.lang, lang),
          sql`${subquery.matchedCount} > 0`,
          sql`${subquery.matchedCount} < ${subquery.totalCount}`, // Exclude 100% matches already fetched
          ...tagConditions
        )
      )
      .orderBy(desc(matchPercentage), asc(recipes.id))
      .limit(partialMatchLimit)
      .offset(partialMatchOffset);

    return [...perfectMatchRecipes, ...partialMatchRecipes];
  },

  /**
   * @description МАКСИМАЛЬНО БЫСТРЫЙ метод для поиска рецептов по названию с поддержкой ингредиентов, тегов, пагинации и расширенных полей.
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

    // Subquery to calculate matched and total ingredients for each recipe
    const ingredientMatchSubquery = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${recipeIngredients.ingredientId} IN ${ingredientIds} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredientMatchSubquery');

    const matchPercentage = sql<number>`ROUND((${ingredientMatchSubquery.matchedCount} * 100.0) / NULLIF(${ingredientMatchSubquery.totalCount}, 0))`;

    const conditions = [
      ilike(recipes.title, `%${query}%`),
      eq(recipes.lang, lang),
      ...tagConditions,
    ];

    let queryBuilder = db
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

    return queryBuilder;
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
    const [recipe] = await db
      .update(recipes)
      .set({ viewed: sql`${recipes.viewed} + 1` })
      .where(eq(recipes.id, id))
      .returning();

    if (!recipe) return undefined;

    const [
      allIngredients,
      recipeMealTypesData,
      recipeDietsData,
      recipeKitchensData,
    ] = await Promise.all([
      db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, id)),
      db
        .select({ tag: mealTypes })
        .from(recipeMealTypes)
        .innerJoin(mealTypes, eq(recipeMealTypes.mealTypeId, mealTypes.id))
        .where(eq(recipeMealTypes.recipeId, id)),
      db
        .select({ tag: diets })
        .from(recipeDiets)
        .innerJoin(diets, eq(recipeDiets.dietId, diets.id))
        .where(eq(recipeDiets.recipeId, id)),
      db
        .select({ tag: kitchens })
        .from(recipeKitchens)
        .innerJoin(kitchens, eq(recipeKitchens.kitchenId, kitchens.id))
        .where(eq(recipeKitchens.recipeId, id)),
    ]);

    const validIngredients = allIngredients.filter(
      (ing) => ing.ingredientId != null
    );
    const matchedIngredients = validIngredients.filter((ing) =>
      ingredientIds.includes(ing.ingredientId!)
    );
    const missingIngredients = validIngredients.filter(
      (ing) => !ingredientIds.includes(ing.ingredientId!)
    );
    const matchPercentage =
      validIngredients.length > 0
        ? Math.round(
            (matchedIngredients.length / validIngredients.length) * 100
          )
        : 0;

    return {
      ...recipe,
      recipeIngredients: allIngredients,
      matchPercentage,
      missingIngredients,
      mealTypes: recipeMealTypesData.map((t) => t.tag),
      diets: recipeDietsData.map((t) => t.tag),
      kitchens: recipeKitchensData.map((t) => t.tag),
    };
  },

  /**
   * @description Считает количество рецептов по фильтрам. Оптимизирован.
   * Всегда возвращает количество рецептов, где все ингредиенты совпадают.
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
    let query = db.select({ value: count() }).from(recipes).$dynamic();

    if (ingredientIds?.length) {
      const subquery = db
        .select({
          recipeId: recipeIngredients.recipeId,
          matchedCount: count(
            sql`CASE WHEN ${recipeIngredients.ingredientId} IN ${ingredientIds} THEN 1 END`
          ).as('matched_count'),
          totalCount: count(recipeIngredients.ingredientId).as('total_count'),
        })
        .from(recipeIngredients)
        .groupBy(recipeIngredients.recipeId)
        .as('subquery');

      const conditions = [
        eq(recipes.lang, lang),
        sql`${subquery.matchedCount} = ${subquery.totalCount}`, // Only 100% match
        ...tagConditions,
      ];

      query = query
        .innerJoin(subquery, eq(recipes.id, subquery.recipeId))
        .where(and(...conditions));
    } else {
      const conditions = [eq(recipes.lang, lang), ...tagConditions];
      query = query.where(and(...conditions));
    }

    const [{ value }] = await query;
    return value;
  },

  /**
   * @description Считает количество результатов поиска. Оптимизирован.
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
    const conditions = [
      ilike(recipes.title, `%${query}%`),
      eq(recipes.lang, lang),
      ...tagConditions,
    ];
    const [{ value }] = await db
      .select({ value: count() })
      .from(recipes)
      .where(and(...conditions));
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
};
