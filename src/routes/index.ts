import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './userRoutes';
import IngredientRoutes from './ingredient';
const router = Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/ingredients', IngredientRoutes);
router.get('/test', (req, res) => res.json({ ok: true }));
export default router;
