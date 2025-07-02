import { Router } from 'express';
import * as recipeController from './../controllers/recipeController';

const router = Router();

router.get('/recipes', recipeController.getRecipes);
router.get('/recipes/:id', recipeController.getRecipeById);

export default router;
