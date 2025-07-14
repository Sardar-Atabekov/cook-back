import { Router } from 'express';
import * as recipeController from './../controllers/recipeController';

const router = Router();

router.get('/recipes', recipeController.getRecipes);
router.get('/recipe/:id', recipeController.getRecipeById);
router.get('/tags', recipeController.getAllTags);

export default router;
