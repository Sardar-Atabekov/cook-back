import { Router } from 'express';
import * as recipeController from './../controllers/recipeController';
import { recipeStorage } from './../storage';

const router = Router();

router.get('/recipes', recipeController.getRecipes);
router.get('/recipe/:id', recipeController.getRecipeById);
router.get('/tags', recipeController.getAllTags);

// Административный маршрут для управления кэшем
router.get('/admin/cache', recipeController.manageCache);

export default router;
