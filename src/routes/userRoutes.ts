import { Router } from 'express';
import * as userController from './../controllers/savedRecipeController';
import { requireAuth } from './../middlewares/auth';

const router = Router();

router.get('/saved-recipes', requireAuth, userController.getUserSavedRecipes);
router.post('/save-recipe', requireAuth, userController.saveRecipe);
router.delete(
  '/save-recipe/:recipeId',
  requireAuth,
  userController.unsaveRecipe
);
router.get('/cooked-recipes', requireAuth, userController.getUserCookedRecipes);
router.post(
  '/save-cooked-recipe',
  requireAuth,
  userController.saveCookedRecipe
);
router.delete(
  '/save-cooked-recipe/:recipeId',
  requireAuth,
  userController.unsaveCookedRecipe
);
export default router;
