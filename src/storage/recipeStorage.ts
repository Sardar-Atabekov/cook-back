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
type FastRecipeResponse = Recipe & {
  matchedCount: number;
  totalCount: number;
  matchPercentage: number;
};

type FastRecipeListResponse = {
  id: number;
  title: string;
  prepTime: string | null;
  rating: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  matchedCount: number;
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
   * Возвращает все рецепты, соответствующие поиску, но total - только 100% совпадение ингредиентов.
   */
  async getRecipesUniversal(params: {
    ingredientIds?: number[];
    limit: number;
    offset: number;
    lang: string;
    dietTagIds?: number[];
    mealTypeIds?: number[];
    kitchenIds?: number[];
    search?: string;
    searchType?: 'simple' | 'fulltext';
  }): Promise<{ recipes: FastRecipeListResponse[]; total: number }> {
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

    let baseConditions = [eq(recipes.lang, lang), ...tagConditions];

    if (search) {
      if (searchType === 'fulltext') {
        baseConditions.push(
          sql`to_tsvector('simple', ${recipes.title}) @@ plainto_tsquery('simple', ${search})`
        );
      } else {
        baseConditions.push(ilike(recipes.title, `%${search}%`));
      }
    }

    // Подзапрос для статистики ингредиентов (всегда, если есть ingredientIds)
    const ingredientStats = db
      .select({
        recipeId: recipeIngredients.recipeId,
        matchedCount: count(
          sql`CASE WHEN ${inArray(recipeIngredients.ingredientId, ingredientIds || [])} THEN 1 END`
        ).as('matched_count'),
        totalCount: count(recipeIngredients.ingredientId).as('total_count'),
      })
      .from(recipeIngredients)
      .groupBy(recipeIngredients.recipeId)
      .as('ingredient_stats');

    // Основной запрос для получения рецептов (возвращает все, что подходят под базовые условия)
    const recipesResult = await db
      .select({
        id: recipes.id,
        title: recipes.title,
        prepTime: recipes.prepTime,
        rating: recipes.rating,
        difficulty: recipes.difficulty,
        imageUrl: recipes.imageUrl,
        sourceUrl: recipes.sourceUrl,
        matchedCount:
          sql<number>`COALESCE(${ingredientStats.matchedCount}, 0)`.as(
            'matchedCount'
          ),
        totalCount: sql<number>`COALESCE(${ingredientStats.totalCount}, 0)`.as(
          'totalCount'
        ),
        matchPercentage:
          sql<number>`COALESCE(ROUND((${ingredientStats.matchedCount} * 100.0) / NULLIF(${ingredientStats.totalCount}, 0)), 0)`.as(
            'matchPercentage'
          ),
      })
      .from(recipes)
      .leftJoin(ingredientStats, eq(recipes.id, ingredientStats.recipeId))
      .where(
        and(
          ...baseConditions,
          // Если ingredientIds предоставлены, фильтруем по наличию совпадений
          ...(ingredientIds && ingredientIds.length > 0
            ? [sql`COALESCE(${ingredientStats.matchedCount}, 0) > 0`]
            : []),
          ...(ingredientIds && ingredientIds.length > 0
            ? [sql`COALESCE(${ingredientStats.totalCount}, 0) > 0`]
            : [])
        )
      )
      .orderBy(
        // Сортировка по проценту совпадения, если есть ингредиенты, иначе по ID
        ...(ingredientIds && ingredientIds.length > 0
          ? [
              desc(
                sql`COALESCE(ROUND((${ingredientStats.matchedCount} * 100.0) / NULLIF(${ingredientStats.totalCount}, 0)), 0)`
              ),
            ]
          : []),
        desc(recipes.id)
      )
      .limit(limit)
      .offset(offset);

    // Отдельный запрос для подсчета total: только рецепты с 100% совпадением
    let totalCount100Percent = 0;
    if (ingredientIds && ingredientIds.length > 0) {
      const totalResult = await db
        .select({ value: count() })
        .from(recipes)
        .leftJoin(ingredientStats, eq(recipes.id, ingredientStats.recipeId))
        .where(
          and(
            ...baseConditions,
            sql`COALESCE(${ingredientStats.matchedCount}, 0) = COALESCE(${ingredientStats.totalCount}, 0)`,
            sql`COALESCE(${ingredientStats.totalCount}, 0) > 0`
          )
        );
      totalCount100Percent = totalResult[0]?.value ?? 0;
    } else {
      // Если ingredientIds не предоставлены, totalCount100Percent будет 0
      totalCount100Percent = 0;
    }

    return {
      recipes: recipesResult,
      total: totalCount100Percent,
    };
  },

  /**
   * @description Сверхбыстрый метод для получения рецептов без фильтрации по ингредиентам.
   * Использует покрывающий индекс для максимальной производительности.
   */
  async getRecipesFast(params: {
    limit: number;
    offset: number;
    lang: string;
    dietTagIds?: number[];
    mealTypeIds?: number[];
    kitchenIds?: number[];
    search?: string;
    searchType?: 'simple' | 'fulltext';
  }): Promise<{ recipes: FastRecipeListResponse[]; total: number }> {
    const {
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

    // Оптимизированный запрос с покрывающим индексом
    const recipesResult = await db
      .select({
        id: recipes.id,
        title: recipes.title,
        prepTime: recipes.prepTime,
        rating: recipes.rating,
        imageUrl: recipes.imageUrl,
        sourceUrl: recipes.sourceUrl,
        matchedCount: sql<number>`0`.as('matchedCount'),
        matchPercentage: sql<number>`0`.as('matchPercentage'),
        total: sql<number>`count(*) OVER()`.as('total'),
      })
      .from(recipes)
      .where(and(...baseConditions))
      .orderBy(desc(recipes.id))
      .limit(limit)
      .offset(offset);

    return {
      recipes: recipesResult,
      total: recipesResult.length > 0 ? recipesResult[0].total : 0,
    };
  },

  /**
   * @description Метод для получения рецептов с предварительно вычисленной статистикой ингредиентов.
   * Использует материализованное представление или кэшированные результаты.
   */
  async getRecipesWithCachedStats(params: {
    ingredientIds?: number[];
    limit: number;
    offset: number;
    lang: string;
    dietTagIds?: number[];
    mealTypeIds?: number[];
    kitchenIds?: number[];
    search?: string;
  }): Promise<{ recipes: FastRecipeListResponse[]; total: number }> {
    // TODO: Реализовать с использованием материализованного представления
    // или кэшированных результатов для еще большей производительности
    return this.getRecipesUniversal(params);
  },
};
