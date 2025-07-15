import { Request, Response } from 'express';
import { recipeStorage } from './../storage';

export async function getRecipes(req: Request, res: Response) {
  try {
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
    if (!lang || typeof lang !== 'string') {
      return res
        .status(400)
        .json({ message: 'Missing or invalid "lang" parameter' });
    }

    const parsedLimit = Math.max(parseInt(limit as string), 1);
    const parsedOffset = Math.max(parseInt(offset as string), 0);

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
    const ingredientIds = ingredientParam
      ? (typeof ingredientParam === 'string'
          ? ingredientParam
          : Array.isArray(ingredientParam) &&
              ingredientParam.every((el) => typeof el === 'string')
            ? (ingredientParam as string[]).join(',')
            : ''
        )
          .split(',')
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id))
      : [];

    // Поиск по заголовку
    if (search) {
      const recipes = await recipeStorage.searchRecipes(
        search as string,
        lang,
        ingredientIds,
        parsedLimit + 1,
        parsedOffset,
        dietTagIds,
        mealTypeIds,
        kitchenIds
      );

      const hasMore = recipes.length > parsedLimit;
      const limitedRecipes = recipes.slice(0, parsedLimit);

      // Получение общего количества результатов поиска
      const total = await recipeStorage.countSearchResults(
        search as string,
        lang,
        dietTagIds,
        mealTypeIds,
        kitchenIds
      );

      return res.json({
        recipes: limitedRecipes,
        total,
        hasMore,
      });
    }

    // Получение рецептов (limit + 1 — для определения hasMore)

    const recipes = await recipeStorage.getRecipes(
      ingredientIds,
      parsedLimit + 1,
      parsedOffset,
      lang,
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );

    const hasMore = recipes.length > parsedLimit;
    const limitedRecipes = recipes.slice(0, parsedLimit);

    // Получение общего количества (для фронта — пагинация, индикаторы и т.п.)
    const total = await recipeStorage.countRecipes(
      ingredientIds,
      lang,
      dietTagIds,
      mealTypeIds,
      kitchenIds
    );

    res.json({
      recipes: limitedRecipes,
      total,
      hasMore,
    });
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
    const recipe = await recipeStorage.getRecipeById(id, ingredientIds);
    console.log('recipe', recipe);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    res.json(recipe);
  } catch (error) {
    console.error('getRecipeById error:', error);
    res.status(500).json({ message: 'Failed to fetch recipe' });
  }
}

export async function getAllTags(req: Request, res: Response) {
  try {
    const tags = await recipeStorage.getAllTags();

    res.json({
      tags,
    });
  } catch (error) {
    console.error('getRecipes error:', error);
    res.status(500).json({ message: 'Failed to fetch recipes' });
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
