import { Request, Response } from 'express';
import { recipeStorage } from '../storage';
import { cache } from '../storage/redis';
import { recipeByIdStorage, tagStorage } from '@/storage/recipeById';

export async function getRecipes(req: Request, res: Response) {
  try {
    const {
      ingredients: ingredientParam,
      limit = '20',
      offset = '0',
      search,
      lang,
      kitchens,
      dietTags,
      mealType,
    } = req.query;

    if (!lang || typeof lang !== 'string') {
      return res.status(400).json({
        message: 'Missing or invalid "lang" parameter',
      });
    }

    // Быстрая валидация и парсинг параметров
    const parsedLimit = Math.min(Math.max(parseInt(limit as string), 1), 40);
    const parsedOffset = Math.min(
      Math.max(parseInt(offset as string), 0),
      10000
    );

    // Парсим теги (оптимизировано для фронтенда)
    const dietTagIds = parseTagParam(dietTags);
    const mealTypeIds = parseTagParam(mealType);
    const kitchenIds = parseTagParam(kitchens);

    // Парсим ингредиенты (оптимизировано для фронтенда)
    const ingredientIds = parseIngredientParam(ingredientParam);

    // Формируем ключ кэша
    const cacheKey = `recipes:${lang}:${parsedLimit}:${parsedOffset}:${ingredientIds.join(',')}:${dietTagIds.join(',')}:${mealTypeIds.join(',')}:${kitchenIds.join(',')}:${search || ''}`;

    // Проверяем кэш
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log('[CACHE HIT] getRecipes', cacheKey);
      return res.json(JSON.parse(cached));
    }

    // Определяем тип поиска
    let searchType: 'simple' | 'fulltext' = 'simple';
    if (search) {
      try {
        // Пробуем полнотекстовый поиск
        const result = await recipeStorage.getRecipesUniversal({
          ingredientIds,
          limit: parsedLimit + 1,
          offset: parsedOffset,
          lang,
          dietTagIds,
          mealTypeIds,
          kitchenIds,
          search: search as string,
          searchType: 'fulltext',
        });

        const response = formatResponse(result, parsedLimit);
        await cache.setex(cacheKey, 604800, JSON.stringify(response));
        return res.json(response);
      } catch (error) {
        console.log('Fulltext search failed, falling back to simple search');
        searchType = 'simple';
      }
    }

    // Выполняем запрос
    const result = await recipeStorage.getRecipesUniversal({
      ingredientIds,
      limit: parsedLimit + 1,
      offset: parsedOffset,
      lang,
      dietTagIds,
      mealTypeIds,
      kitchenIds,
      search: search as string,
      searchType,
    });

    const response = formatResponse(result, parsedLimit);

    // Кэшируем результат
    await cache.setex(cacheKey, 604800, JSON.stringify(response));

    res.json(response);
  } catch (error) {
    console.error('getRecipes error:', error);
    res.status(500).json({ message: 'Failed to fetch recipes' });
  }
}

export async function getRecipeById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid recipe ID' });
    }

    const cacheKey = `recipe:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // Быстрый возврат результата
    const recipe = await recipeByIdStorage.getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    await cache.setex(cacheKey, 604800, JSON.stringify(recipe));
    return res.json(recipe);
  } catch (error) {
    console.error('getRecipeById error:', error);
    res.status(500).json({ message: 'Failed to fetch recipe' });
  }
}

export async function getAllTags(req: Request, res: Response) {
  try {
    const cacheKey = 'tags:all';
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const tags = await tagStorage.getAllTags();
    const response = { tags };

    await cache.setex(cacheKey, 604800, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error('getAllTags error:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
}

// Административный эндпоинт для управления кэшем
export async function manageCache(req: Request, res: Response) {
  try {
    const { action } = req.query;

    switch (action) {
      case 'stats': {
        const stats = await cache.getStats();
        return res.json({ success: true, stats });
      }
      case 'clear-recipes': {
        const cleared = await cache.clearRecipesCache();
        return res.json({ success: true, cleared });
      }
      case 'clear-ingredients': {
        const cleared = await cache.clearIngredientsCache();
        return res.json({ success: true, cleared });
      }
      case 'clear-tags': {
        const cleared = await cache.clearTagsCache();
        return res.json({ success: true, cleared });
      }
      case 'clear-ingredient-stats': {
        const cleared = await cache.clearIngredientStatsCache();
        return res.json({ success: true, cleared });
      }
      case 'clear-recipe-counts': {
        const cleared = await cache.clearRecipeCountCache();
        return res.json({ success: true, cleared });
      }
      case 'clear-all':
        await cache.clearAll();
        return res.json({ success: true, message: 'All cache cleared' });
      case 'flush-all':
        await cache.flushAll();
        return res.json({ success: true, message: 'Redis flushed completely' });
      default:
        return res.status(400).json({
          success: false,
          message:
            'Invalid action. Use: stats, clear-recipes, clear-ingredients, clear-tags, clear-all, flush-all',
        });
    }
  } catch (error) {
    console.error('Cache management error:', error);
    res.status(500).json({ success: false, message: 'Failed to manage cache' });
  }
}

/**
 * Быстрый парсер тегов с поддержкой разных форматов от фронтенда
 *
 * Поддерживаемые форматы:
 * - [1, 2, 3] - массив чисел (самый быстрый)
 * - ["1", "2", "3"] - массив строк
 * - "1,2,3" - строка с числами через запятую
 * - undefined/null - пустой массив
 */
function parseTagParam(value: unknown): number[] {
  // Если фронтенд уже отправил массив чисел - используем как есть (самый быстрый)
  if (
    Array.isArray(value) &&
    value.every((n) => typeof n === 'number' && !isNaN(n))
  ) {
    return value;
  }

  // Если фронтенд отправил массив строк с числами
  if (Array.isArray(value) && value.every((s) => typeof s === 'string')) {
    return value.map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  }

  // Если фронтенд отправил строку с числами через запятую
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  return [];
}

/**
 * Быстрый парсер ингредиентов с поддержкой разных форматов от фронтенда
 *
 * Поддерживаемые форматы:
 * - [1, 2, 3] - массив чисел (самый быстрый)
 * - ["1", "2", "3"] - массив строк
 * - "1,2,3" - строка с числами через запятую
 * - undefined/null - пустой массив
 */
function parseIngredientParam(value: unknown): number[] {
  // Если фронтенд уже отправил массив чисел - используем как есть (самый быстрый)
  if (
    Array.isArray(value) &&
    value.every((n) => typeof n === 'number' && !isNaN(n))
  ) {
    return value;
  }

  // Если фронтенд отправил массив строк с числами
  if (Array.isArray(value) && value.every((s) => typeof s === 'string')) {
    return value
      .flatMap((s) => s.split(','))
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  // Если фронтенд отправил строку с числами через запятую
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  return [];
}

function formatResponse(
  result: { recipes: any[]; total: number },
  limit: number
): { recipes: any[]; total: number; hasMore: boolean } {
  const hasMore = result.recipes.length > limit;
  const limitedRecipes = result.recipes.slice(0, limit);

  return {
    recipes: limitedRecipes,
    total: result.total,
    hasMore,
  };
}
