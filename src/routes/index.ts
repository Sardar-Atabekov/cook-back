import { Router } from 'express';
import authRoutes from './auth';

const router = Router();

router.use('/user', authRoutes);
router.get('/test', (req, res) => res.json({ ok: true }));

export default router;
