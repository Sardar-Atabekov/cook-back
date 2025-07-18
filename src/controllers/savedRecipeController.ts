import { Request, Response } from 'express';
import {
  recipeStorage,
  getIngredientsForRecipeIds,
  getTagsForRecipeIds,
} from './../storage';
import { cache } from '../storage/redis';

export async function getUserSavedRecipes(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const full = req.query.full === 'true';
    const cacheKey = `saved_recipes:${req.user.id}${full ? ':full' : ''}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const recipes = await recipeStorage.getUserSavedRecipes(
      req.user.id,
      100,
      0
    );
    if (!full) {
      await cache.setex(cacheKey, 3600, JSON.stringify(recipes));
      return res.json(recipes);
    }
    // batch ingredients and tags for all saved recipes
    const recipeIds = recipes.map((r) => r.id);
    const [ingredientsMap, tags] = await Promise.all([
      getIngredientsForRecipeIds(recipeIds),
      getTagsForRecipeIds(recipeIds),
    ]);
    const result = recipes.map((recipe) => ({
      ...recipe,
      recipeIngredients: ingredientsMap.get(recipe.id) || [],
      mealTypes: tags.mealTypes.get(recipe.id) || [],
      diets: tags.diets.get(recipe.id) || [],
      kitchens: tags.kitchens.get(recipe.id) || [],
    }));
    await cache.setex(cacheKey, 3600, JSON.stringify(result));
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Failed to fetch saved recipes' });
  }
}

export async function saveRecipe(req: Request & { user?: any }, res: Response) {
  try {
    const { recipeId } = req.body;
    const savedRecipe = await recipeStorage.saveRecipe(req.user.id, recipeId);

    // Инвалидируем кэш избранных рецептов пользователя
    const cacheKey = `saved_recipes:${req.user.id}`;
    await cache.del(cacheKey);

    res.json(savedRecipe);
  } catch {
    res.status(500).json({ message: 'Failed to save recipe' });
  }
}

export async function unsaveRecipe(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const recipeId = parseInt(req.params.recipeId);
    await recipeStorage.unsaveRecipe(req.user.id, recipeId);

    // Инвалидируем кэш избранных рецептов пользователя
    const cacheKey = `saved_recipes:${req.user.id}`;
    await cache.del(cacheKey);

    res.json({ message: 'Recipe unsaved' });
  } catch {
    res.status(500).json({ message: 'Failed to unsave recipe' });
  }
}
