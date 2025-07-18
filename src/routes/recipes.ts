import { Router } from 'express';
import * as recipeController from './../controllers/recipeController';
import { recipeStorage } from './../storage';

const router = Router();

router.get('/recipes', recipeController.getRecipes);
router.get('/recipe/:id', recipeController.getRecipeById);
router.get('/tags', recipeController.getAllTags);
router.get('/popular', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const recipes = await recipeStorage.getPopularRecipes(limit);
  res.json(recipes);
});

router.get('/popular-ingredients', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const ingredients = await recipeStorage.getPopularIngredients(limit);
  res.json(ingredients);
});

// Административный маршрут для управления кэшем
router.get('/admin/cache', recipeController.manageCache);

export default router;
