import {
  recipes,
  recipeIngredients,
  type Recipe,
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
    console.log('=== DEBUG getRecipes ===');
    console.log('lang:', lang);
    console.log('ingredientIds:', ingredientIds);
    console.log('dietTagIds:', dietTagIds);
    console.log('mealTypeIds:', mealTypeIds);
    console.log('kitchenIds:', kitchenIds);
    console.log('tagConditions count:', tagConditions.length);
    console.log('baseConditions count:', baseConditions.length);
    if (!ingredientIds?.length) {
      // Если ингредиенты не переданы, но есть фильтры по тегам — фильтруем только по тегам
      if (dietTagIds?.length || mealTypeIds?.length || kitchenIds?.length) {
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
        console.log('=== RESULT (with tags filter) ===');
        console.log('result length:', result.length);
        console.log('first result:', result[0]);
        return result;
      }
      // Простой случай без фильтрации по ингредиентам и тегам — возвращаем все рецепты
      const result = await db
        .select({
          ...selectFields,
          matchedCount: sql<number>`0`.as('matchedCount'),
          totalCount: sql<number>`0`.as('totalCount'),
          matchPercentage: sql<number>`0`.as('matchPercentage'),
        })
        .from(recipes)
        .where(eq(recipes.lang, lang))
        .orderBy(desc(recipes.id))
        .limit(limit)
        .offset(offset);
      console.log('=== RESULT (no filters) ===');
      console.log('result length:', result.length);
      console.log('first result:', result[0]);
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
   * @description Универсальный метод для получения рецептов с поиском и подсчётом.
   * Обрабатывает все случаи: обычные рецепты, поиск, полнотекстовый поиск.
   */
  async getRecipesUniversal(params: {
    ingredientIds: number[];
    limit: number;
    offset: number;
    lang: string;
    dietTagIds: number[];
    mealTypeIds: number[];
    kitchenIds: number[];
    search?: string;
    searchType?: 'simple' | 'fulltext';
  }): Promise<{ recipes: FastRecipeResponse[]; total: number }> {
    const {
      ingredientIds,
      limit,
      offset,
      lang,
      dietTagIds,
      mealTypeIds,
      kitchenIds,
      search,
      searchType = 'simple',
    } = params;

    const tagConditions = buildTagFilterConditions(
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    const selectFields = getTableColumns(recipes);

    // Базовые условия
    let baseConditions = [eq(recipes.lang, lang), ...tagConditions];

    // Добавляем условия поиска
    if (search) {
      if (searchType === 'fulltext') {
        baseConditions.push(
          sql`to_tsvector('simple', ${recipes.title}) @@ plainto_tsquery('simple', ${search})`
        );
      } else {
        baseConditions.push(ilike(recipes.title, `%${search}%`));
      }
    }

    // Если нет ингредиентов
    if (!ingredientIds?.length) {
      const [recipesResult, totalResult] = await Promise.all([
        db
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
          .offset(offset),
        db
          .select({ value: count() })
          .from(recipes)
          .where(and(...baseConditions)),
      ]);

      return {
        recipes: recipesResult,
        total: totalResult[0].value,
      };
    }

    // Если есть ингредиенты - добавляем подсчёт совпадений
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

    // Получаем рецепты и общее количество
    const [recipesResult, totalResult] = await Promise.all([
      db
        .select({
          ...selectFields,
          matchedCount:
            sql<number>`COALESCE(${ingredientStats.matchedCount}, 0)`.as(
              'matchedCount'
            ),
          totalCount:
            sql<number>`COALESCE(${ingredientStats.totalCount}, 0)`.as(
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
            // Только рецепты с совпадениями
            sql`COALESCE(${ingredientStats.matchedCount}, 0) > 0`,
            sql`COALESCE(${ingredientStats.totalCount}, 0) > 0`
          )
        )
        .orderBy(desc(matchPercentage), desc(recipes.id))
        .limit(limit)
        .offset(offset),
      db
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
        ),
    ]);

    return {
      recipes: recipesResult,
      total: totalResult[0].value,
    };
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
    const matchPercentage = sql<number>`ROUND((${subquery.matchedCount} * 100.0) / NULLIF(${subquery.totalCount}, 0))`;

    return db
      .select({
        ...selectFields,
        matchedCount: sql<number>`COALESCE(${subquery.matchedCount}, 0)`.as(
          'matchedCount'
        ),
        totalCount: sql<number>`COALESCE(${subquery.totalCount}, 0)`.as(
          'totalCount'
        ),
        matchPercentage: sql<number>`COALESCE(${matchPercentage}, 0)`.as(
          'matchPercentage'
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
};
