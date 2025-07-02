import { Router } from 'express';
import * as userController from './../controllers/savedRecipeController';
// import { authenticateToken } from './authMiddleware';

const router = Router();

router.get('/saved-recipes', userController.getUserSavedRecipes);
router.post('/save-recipe', userController.saveRecipe);
router.delete('/save-recipe/:recipeId', userController.unsaveRecipe);

export default router;
