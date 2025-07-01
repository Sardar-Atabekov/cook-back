import express from 'express';
import { users } from '../models/user';
import { db } from '../db';
import {
  hashPassword,
  comparePasswords,
  generateToken,
} from '../services/auth';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    // Проверка на существование пользователя
    const exists = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .then((r) => r[0]);
    if (exists) return res.status(400).json({ error: 'Email already exists' });

    const hashed = await hashPassword(password);

    // Создание пользователя
    const [newUser] = await db
      .insert(users)
      .values({ name, email, password: hashed })
      .returning();

    const token = generateToken({ id: String(newUser.id), email });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        lastLogin: new Date(),
      },
      expiresIn: '7d',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(400).json({ error: 'Invalid data' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Поиск пользователя
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .then((r) => r[0]);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        details: 'User with this email not found',
      });
    }
    if (user.isLocked) {
      return res.status(403).json({
        error: 'Account is locked',
        details: 'Contact support to unlock your account',
      });
    }
    const match = await comparePasswords(password, user.password);
    if (!match) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      let isLocked = user.isLocked;

      if (failedLoginAttempts >= 100) {
        isLocked = true;
      }

      // Обновление попыток и блокировки
      await db
        .update(users)
        .set({ failedLoginAttempts, isLocked })
        .where(eq(users.id, user.id));

      if (isLocked) {
        return res.status(403).json({
          error: 'Account temporarily locked',
          details: 'Too many failed login attempts',
        });
      }

      return res.status(401).json({
        error: 'Invalid credentials',
        details: 'Incorrect password',
        attemptsLeft: 100 - failedLoginAttempts,
      });
    }

    // Сброс попыток и обновление времени входа
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lastLogin: new Date() })
      .where(eq(users.id, user.id));

    const token = generateToken({
      id: String(user.id),
      email: user.email,
    });

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        lastLogin: new Date(),
      },
      expiresIn: '7d',
    });
  } catch (err) {
    console.error('Login error:', err);

    // Добавьте это для подробного вывода
    res.status(500).json({
      error: 'Server error',
      details: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
});

export default router;
