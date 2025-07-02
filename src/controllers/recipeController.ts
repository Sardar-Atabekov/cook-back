import { Request, Response } from 'express';
import { storage } from './../storage';

export async function getRecipes(req: Request, res: Response) {
  try {
    const {
      ingredients: ingredientParam,
      limit = '8',
      offset = '0',
      search,
    } = req.query;

    if (search) {
      const recipes = await storage.searchRecipes(search as string);
      return res.json({ recipes, total: recipes.length });
    }

    const ingredientIds = ingredientParam
      ? (ingredientParam as string)
          .split(',')
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id))
      : [];

    const recipes = await storage.getRecipes(
      ingredientIds,
      parseInt(limit),
      parseInt(offset)
    );

    const recipesWithMatch = recipes.map((recipe) => {
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

    res.json({ recipes: recipesWithMatch, total: recipesWithMatch.length });
  } catch {
    res.status(500).json({ message: 'Failed to fetch recipes' });
  }
}

export async function getRecipeById(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const recipe = await storage.getRecipeById(id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }
    res.json(recipe);
  } catch {
    res.status(500).json({ message: 'Failed to fetch recipe' });
  }
}
