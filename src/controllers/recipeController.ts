import { Request, Response } from 'express';
import { recipeStorage } from '../storage';
import { cache } from '../storage/redis';
import { recipeByIdStorage } from '@/storage/recipeById';

export async function getRecipes(req: Request, res: Response) {
  try {
    const requestId = Math.random().toString(36).substring(7);
    const {
      ingredients: ingredientParam,
      limit = '20',
      offset = '0',
      search,
      lang,
      country,
      dietTags,
      mealType,
    } = req.query;
    console.log('req.query', req.query);
    if (!lang || typeof lang !== 'string') {
      return res
        .status(400)
        .json({ message: 'Missing or invalid "lang" parameter' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit as string), 1), 40);
    const parsedOffset = Math.min(
      Math.max(parseInt(offset as string), 0),
      10000
    );

    function toStringOrStringArray(
      param: unknown
    ): string | string[] | undefined {
      if (typeof param === 'string') return param;
      if (Array.isArray(param) && param.every((el) => typeof el === 'string'))
        return param as string[];
      return undefined;
    }

    const dietTagIds = parseTagParam(toStringOrStringArray(dietTags));
    const mealTypeIds = parseTagParam(toStringOrStringArray(mealType));
    const kitchenIds = parseTagParam(toStringOrStringArray(country));
    // Корректно формируем массив чисел для ingredientIds
    let ingredientIds: number[] = [];
    if (ingredientParam) {
      if (Array.isArray(ingredientParam)) {
        ingredientIds = ingredientParam
          .flatMap((s: any) => String(s).split(','))
          .map(Number)
          .filter((id) => !isNaN(id));
      } else if (typeof ingredientParam === 'string') {
        ingredientIds = ingredientParam
          .split(',')
          .map(Number)
          .filter((id) => !isNaN(id));
      }
    }
    // Гарантируем, что ingredientIds всегда массив для Postgres
    const pgIngredientIds = ingredientIds;

    // Формируем уникальный ключ кэша по всем параметрам
    const cacheKey = `recipes:${JSON.stringify({ ingredientParam, limit, offset, search, lang, country, dietTags, mealType, only: req.query.only })}`;
    // Проверяем кэш только если нет search (иначе кэшировать можно отдельно)
    if (!search) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        console.log('[CACHE HIT] getRecipes', cacheKey);
        console.timeEnd(`getRecipes-total-${requestId}`);
        return res.json(JSON.parse(cached));
      }
    }
    // Поиск по заголовку
    if (search) {
      // Используем полнотекстовый поиск
      const searchCacheKey = `recipes:fts:${JSON.stringify({ search, lang, ingredientIds, parsedLimit, parsedOffset, dietTagIds, mealTypeIds, kitchenIds })}`;
      const cachedSearch = await cache.get(searchCacheKey);
      if (cachedSearch) {
        console.log('[CACHE HIT] getRecipes search', searchCacheKey);
        console.timeEnd(`getRecipes-total-${requestId}`);
        return res.json(JSON.parse(cachedSearch));
      }
      let recipes;
      console.time(`getRecipes-sql-${requestId}`);
      try {
        recipes = await recipeStorage.fullTextSearchRecipes(
          search as string,
          lang,
          ingredientIds,
          parsedLimit + 1,
          parsedOffset,
          dietTagIds,
          mealTypeIds,
          kitchenIds
        );
      } catch {
        // fallback на обычный поиск если ошибка
        recipes = await recipeStorage.searchRecipes(
          search as string,
          lang,
          ingredientIds,
          parsedLimit + 1,
          parsedOffset,
          dietTagIds,
          mealTypeIds,
          kitchenIds
        );
      }
      console.timeEnd(`getRecipes-sql-${requestId}`);
      console.time(`getRecipes-postprocess-${requestId}`);

      // УБРАТЬ фильтрацию по совпадениям!
      const hasMore = recipes.length > parsedLimit;
      const limitedRecipes = recipes.slice(0, parsedLimit);
      console.timeEnd(`getRecipes-postprocess-${requestId}`);
      console.time(`getRecipes-totalCount-${requestId}`);
      const total = await recipeStorage.countSearchResults(
        search as string,
        lang,
        dietTagIds,
        mealTypeIds,
        kitchenIds
      );
      console.timeEnd(`getRecipes-totalCount-${requestId}`);
      const response = { recipes: limitedRecipes, total, hasMore };
      await cache.setex(searchCacheKey, 604800, JSON.stringify(response));
      console.timeEnd(`getRecipes-total-${requestId}`);
      return res.json(response);
    }

    const isNoIngredients = !pgIngredientIds || pgIngredientIds.length === 0;
    const plainCacheKey = isNoIngredients
      ? `recipes:plain:${JSON.stringify({ limit, offset, lang, country, dietTags, mealType, only: req.query.only })}`
      : `recipes:${JSON.stringify({ ingredientParam, limit, offset, lang, country, dietTags, mealType, only: req.query.only })}`;

    // Проверяем кэш только если нет ингредиентов
    if (!search && isNoIngredients) {
      const cached = await cache.get(plainCacheKey);
      if (cached) {
        console.log('[CACHE HIT] getRecipes plain', plainCacheKey);
        console.timeEnd(`getRecipes-total-${requestId}`);
        return res.json(JSON.parse(cached));
      }
    }
    // Получение рецептов (limit + 1 — для определения hasMore)
    const listCacheKey = `recipes:${JSON.stringify({ ingredientParam, limit, offset, search, lang, country, dietTags, mealType, only: req.query.only })}`;
    const cached = await cache.get(listCacheKey);
    if (cached) {
      console.log('[CACHE HIT] getRecipes', listCacheKey);
      console.timeEnd(`getRecipes-total-${requestId}`);
      return res.json(JSON.parse(cached));
    }
    console.time(`getRecipes-sql-${requestId}`);
    const recipes = await recipeStorage.getRecipes(
      pgIngredientIds,
      parsedLimit + 1,
      parsedOffset,
      lang,
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );
    console.timeEnd(`getRecipes-sql-${requestId}`);
    console.time(`getRecipes-postprocess-${requestId}`);

    // УБРАТЬ фильтрацию по совпадениям!
    const hasMore = recipes.length > parsedLimit;
    const limitedRecipes = recipes.slice(0, parsedLimit);
    console.timeEnd(`getRecipes-postprocess-${requestId}`);
    console.time(`getRecipes-totalCount-${requestId}`);

    // Кэшируем подсчёт для ускорения
    let total;
    if (isNoIngredients) {
      total = await cache.get('recipes:plain:count:' + lang);
      if (total !== null) {
        total = Number(total);
      } else {
        total = await recipeStorage.countRecipes(
          [],
          lang,
          dietTagIds,
          mealTypeIds,
          kitchenIds
        );
        await cache.setex('recipes:plain:count:' + lang, 3600, String(total)); // 1 час
      }
    } else {
      total = await cache.getCachedRecipeCount({
        ingredientIds: pgIngredientIds,
        lang,
        dietTagIds,
        mealTypeIds,
        kitchenIds,
      });
      if (total === null) {
        total = await recipeStorage.countRecipes(
          pgIngredientIds,
          lang,
          dietTagIds,
          mealTypeIds,
          kitchenIds
        );
        await cache.cacheRecipeCount(
          {
            ingredientIds: pgIngredientIds,
            lang,
            dietTagIds,
            mealTypeIds,
            kitchenIds,
          },
          total
        );
      }
    }

    console.timeEnd(`getRecipes-totalCount-${requestId}`);
    const response = { recipes: limitedRecipes, total, hasMore };
    if (isNoIngredients) {
      await cache.setex(plainCacheKey, 3600, JSON.stringify(response)); // 1 час
    } else {
      await cache.setex(listCacheKey, 604800, JSON.stringify(response));
    }
    console.timeEnd(`getRecipes-total-${requestId}`);
    res.json(response);
  } catch (error) {
    console.error('getRecipes error:', error);
    res.status(500).json({ message: 'Failed to fetch recipes' });
  }
}

export async function getRecipeById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const ingredientIdsParam = req.params.ingredientIds;
    const ingredientIds = ingredientIdsParam
      ? (ingredientIdsParam as string)
          .split(',')
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id))
      : [];

    // Гарантируем, что ingredientIds всегда массив для Postgres
    const pgIngredientIds = Array.isArray(ingredientIds)
      ? ingredientIds
      : [ingredientIds];

    // Формируем ключ кэша для конкретного рецепта
    const cacheKey = `recipe:${id}:${ingredientIds.sort().join(',')}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const recipe = await recipeByIdStorage.getRecipeById(id, pgIngredientIds);
    console.log('recipe', recipe);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    // Кэшируем рецепт на 7 дней
    await cache.setex(cacheKey, 604800, JSON.stringify(recipe));
    res.json(recipe);
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
    const tags = await recipeByIdStorage.getAllTags();
    const response = { tags };
    // Кэшируем теги на 7 дней
    await cache.setex(cacheKey, 604800, JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error('getRecipes error:', error);
    res.status(500).json({ message: 'Failed to fetch recipes' });
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
        const recipesCleared = await cache.clearRecipesCache();
        return res.json({ success: true, cleared: recipesCleared });
      }
      case 'clear-ingredients': {
        const ingredientsCleared = await cache.clearIngredientsCache();
        return res.json({ success: true, cleared: ingredientsCleared });
      }
      case 'clear-tags': {
        const tagsCleared = await cache.clearTagsCache();
        return res.json({ success: true, cleared: tagsCleared });
      }
      case 'clear-ingredient-stats': {
        const statsCleared = await cache.clearIngredientStatsCache();
        return res.json({ success: true, cleared: statsCleared });
      }
      case 'clear-recipe-counts': {
        const countsCleared = await cache.clearRecipeCountCache();
        return res.json({ success: true, cleared: countsCleared });
      }
      case 'clear-all':
        await cache.clearAll();
        return res.json({ success: true, message: 'All cache cleared' });

      default:
        return res.status(400).json({
          success: false,
          message:
            'Invalid action. Use: stats, clear-recipes, clear-ingredients, clear-tags, clear-all',
        });
    }
  } catch (error) {
    console.error('Cache management error:', error);
    res.status(500).json({ success: false, message: 'Failed to manage cache' });
  }
}

function parseTagParam(value: string | string[] | undefined): number[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}
