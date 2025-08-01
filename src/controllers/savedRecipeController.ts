import { Request, Response } from 'express';
import { userStorage } from './../storage';
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

    const recipes = await userStorage.getUserSavedRecipes(req.user.id, 100, 0);
    if (!full) {
      await cache.setex(cacheKey, 3600, JSON.stringify(recipes));
      return res.json(recipes);
    }

    const result = recipes;
    await cache.setex(cacheKey, 3600, JSON.stringify(result));
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Failed to fetch saved recipes' });
  }
}

export async function saveRecipe(req: Request & { user?: any }, res: Response) {
  try {
    const { recipeId } = req.body;
    const savedRecipe = await userStorage.saveRecipe(req.user.id, recipeId);

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
    await userStorage.unsaveRecipe(req.user.id, recipeId);

    // Инвалидируем кэш избранных рецептов пользователя
    const cacheKey = `saved_recipes:${req.user.id}`;
    await cache.del(cacheKey);

    res.json({ message: 'Recipe unsaved' });
  } catch {
    res.status(500).json({ message: 'Failed to unsave recipe' });
  }
}

export async function getUserCookedRecipes(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const full = req.query.full === 'true';
    const cacheKey = `cooked_recipes:${req.user.id}${full ? ':full' : ''}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const recipes = await userStorage.getUserCookedRecipes(req.user.id, 100, 0);
    if (!full) {
      await cache.setex(cacheKey, 3600, JSON.stringify(recipes));
      return res.json(recipes);
    }

    const result = recipes;
    await cache.setex(cacheKey, 3600, JSON.stringify(result));
    res.json(result);
  } catch {
    res.status(500).json({ message: 'Failed to fetch saved recipes' });
  }
}

export async function saveCookedRecipe(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const { recipeId } = req.body;
    const savedRecipe = await userStorage.saveCookedRecipe(
      req.user.id,
      recipeId
    );

    // Инвалидируем кэш избранных рецептов пользователя
    const cacheKey = `cooked_recipes:${req.user.id}`;
    await cache.del(cacheKey);

    res.json(savedRecipe);
  } catch {
    res.status(500).json({ message: 'Failed to save recipe' });
  }
}

export async function unsaveCookedRecipe(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const recipeId = parseInt(req.params.recipeId);
    await userStorage.unsaveCookedRecipe(req.user.id, recipeId);

    // Инвалидируем кэш избранных рецептов пользователя
    const cacheKey = `cooked_recipes:${req.user.id}`;
    await cache.del(cacheKey);

    res.json({ message: 'Recipe unsaved' });
  } catch {
    res.status(500).json({ message: 'Failed to unsave recipe' });
  }
}
