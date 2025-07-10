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
    } = req.query;

    if (!lang || typeof lang !== 'string') {
      return res
        .status(400)
        .json({ message: 'Missing or invalid "lang" parameter' });
    }

    const parsedLimit = Math.max(parseInt(limit as string), 1);
    const parsedOffset = Math.max(parseInt(offset as string), 0);

    const ingredientIds = ingredientParam
      ? (ingredientParam as string)
          .split(',')
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id))
      : [];

    // Поиск по заголовку
    if (search) {
      const recipes = await recipeStorage.searchRecipes(search as string, lang);
      return res.json({
        recipes,
        total: recipes.length,
        hasMore: false,
      });
    }

    // Получение рецептов (limit + 1 — для определения hasMore)
    const recipes = await recipeStorage.getRecipes(
      ingredientIds,
      parsedLimit + 1,
      parsedOffset,
      lang
    );

    const hasMore = recipes.length > parsedLimit;
    const limitedRecipes = recipes.slice(0, parsedLimit);

    // Получение общего количества (для фронта — пагинация, индикаторы и т.п.)
    const total = await recipeStorage.countRecipes(ingredientIds, lang);
    console.log('recipes', recipes);
    const recipesWithMatch = limitedRecipes.map((recipe) => {
      const recipeIngredientIds = recipe.recipeIngredients.map(
        (ri) => ri.ingredientId
      );

      const matchCount = ingredientIds.filter((id) =>
        recipeIngredientIds.includes(id)
      ).length;

      const totalRequired = recipe.recipeIngredients.filter(
        (ri) => ri.required
      ).length;

      const matchPercentage =
        totalRequired > 0 ? Math.round((matchCount / totalRequired) * 100) : 0;

      const missingIngredients = recipe.recipeIngredients
        .filter((ri) => ri.required && !ingredientIds.includes(ri.ingredientId))
        .map((ri) => ri.ingredient.name);

      return {
        ...recipe,
        matchPercentage,
        missingIngredients,
      };
    });

    res.json({
      recipes: recipesWithMatch,
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
    const lang = req.query.lang;

    if (!lang || typeof lang !== 'string') {
      return res
        .status(400)
        .json({ message: 'Missing or invalid "lang" parameter' });
    }

    const recipe = await recipeStorage.getRecipeById(id, lang);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    res.json(recipe);
  } catch (error) {
    console.error('getRecipeById error:', error);
    res.status(500).json({ message: 'Failed to fetch recipe' });
  }
}
