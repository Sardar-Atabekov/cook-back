import { Request, Response } from 'express';
import { storage } from './../storage';

export async function getUserSavedRecipes(
  req: Request & { user?: any },
  res: Response
) {
  try {
    const recipes = await storage.getUserSavedRecipes(req.user.id);
    res.json(recipes);
  } catch {
    res.status(500).json({ message: 'Failed to fetch saved recipes' });
  }
}

export async function saveRecipe(req: Request & { user?: any }, res: Response) {
  try {
    const { recipeId } = req.body;
    const savedRecipe = await storage.saveRecipe(req.user.id, recipeId);
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
    await storage.unsaveRecipe(req.user.id, recipeId);
    res.json({ message: 'Recipe unsaved' });
  } catch {
    res.status(500).json({ message: 'Failed to unsave recipe' });
  }
}
