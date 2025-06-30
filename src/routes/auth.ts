import express from 'express';
import User from '../models/user';
import {
  hashPassword,
  comparePasswords,
  generateToken,
} from '../services/auth';
import { z } from 'zod';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = loginSchema;

router.post('/user', async (req, res) => {
  try {
    const { email, password } = registerSchema.parse(req.body);
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already exists' });

    const hashed = await hashPassword(password);
    const newUser = await User.create({ email, password: hashed });
    const token = generateToken({ id: newUser.id, email });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: email,
        lastLogin: new Date(),
      },
      expiresIn: '7d',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: 'Invalid data' });
  }
});

router.post('/auth', async (req: express.Request, res: express.Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        details: 'User with this email not found',
      });
    }

    console.log('user', user);
    if (user.isLocked) {
      return res.status(403).json({
        error: 'Account is locked',
        details: 'Contact support to unlock your account',
      });
    }

    const match = await comparePasswords(password, user.password);
    if (!match) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= 100) {
        user.isLocked = true;
        await user.save();
        return res.status(403).json({
          error: 'Account temporarily locked',
          details: 'Too many failed login attempts',
        });
      }

      await user.save();
      return res.status(401).json({
        error: 'Invalid credentials',
        details: 'Incorrect password',
        attemptsLeft: 100 - user.failedLoginAttempts,
      });
    }

    user.failedLoginAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken({
      id: user.id,
      email: user.email,
    });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        lastLogin: user.lastLogin,
      },
      expiresIn: '7d',
    });
  } catch (err) {
    console.error('Login error:', err);

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    res.status(500).json({
      error: 'Server error',
      details: 'An unexpected error occurred during login',
    });
  }
});

export { loginSchema };
export default router;
