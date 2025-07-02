import { Request, Response } from 'express';
import { ingredientStorage } from './../storage';

export async function getCategories(req: Request, res: Response) {
  try {
    const categories = await ingredientStorage.getIngredientCategories();
    res.json(categories);
  } catch {
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
}

export async function getIngredients(req: Request, res: Response) {
  try {
    const { categoryId, search } = req.query;

    let ingredients;
    if (search) {
      ingredients = await ingredientStorage.searchIngredients(search as string);
    } else if (categoryId) {
      ingredients = await ingredientStorage.getIngredientsByCategory(
        parseInt(categoryId as string)
      );
    } else {
      ingredients = await ingredientStorage.getAllIngredients();
    }

    res.json(ingredients);
  } catch {
    res.status(500).json({ message: 'Failed to fetch ingredients' });
  }
}
