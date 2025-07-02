import { Router } from 'express';
import * as ingredientController from './../controllers/ingredientController';
// import { authenticateToken } from './authMiddleware';

const router = Router();

router.get('/categories', ingredientController.getCategories);
router.get('/list', ingredientController.getIngredients);

export default router;
