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
};
