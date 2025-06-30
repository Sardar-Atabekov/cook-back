// auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import User from '../models/user';
import authRoutes, { loginSchema } from './auth';

vi.mock('../models/user');

const app = express();
app.use(express.json());
app.use('/api/user', authRoutes); // теперь роуты под /api/user

describe('POST /api/user/user (registration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register a new user', async () => {
    User.findOne = vi.fn().mockResolvedValue(null);
    User.create = vi.fn().mockResolvedValue({
      id: 'mockedId',
      email: 'test@example.com',
    });

    const res = await request(app)
      .post('/api/user/user')
      .send({ email: 'test@example.com', password: '123456' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('should return 400 if user exists', async () => {
    User.findOne = vi.fn().mockResolvedValue({ email: 'test@example.com' });

    const res = await request(app)
      .post('/api/user/user')
      .send({ email: 'test@example.com', password: '123456' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/user/auth (login)', () => {
  const mockUser = {
    id: 'userId',
    email: 'user@example.com',
    password: 'hashedPassword',
    isLocked: false,
    failedLoginAttempts: 0,
    lastLogin: null,
    save: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should login successfully with correct credentials', async () => {
    User.findOne = vi.fn().mockResolvedValue({ ...mockUser });
    const comparePasswords = vi.fn().mockResolvedValue(true);
    const generateToken = vi.fn().mockReturnValue('mockedToken');
    vi.doMock('../services/auth', () => ({
      comparePasswords,
      generateToken,
    }));

    const authRoutes = (await import('./auth')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/user', authRoutes);

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: mockUser.email, password: 'correctPassword' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(mockUser.email);
    expect(res.body).toHaveProperty('expiresIn');
  });

  it('should return 401 if user not found', async () => {
    User.findOne = vi.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: 'notfound@example.com', password: 'anyany' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
    expect(res.body).toHaveProperty(
      'details',
      'User with this email not found'
    );
  });

  it('should return 403 if account is locked', async () => {
    User.findOne = vi.fn().mockResolvedValue({ ...mockUser, isLocked: true });

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: mockUser.email, password: 'password' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Account is locked');
    expect(res.body).toHaveProperty('details');
  });

  it('should return 401 and increment failedLoginAttempts on wrong password', async () => {
    const user = {
      ...mockUser,
      failedLoginAttempts: 1,
      save: vi.fn().mockResolvedValue(undefined),
    };
    User.findOne = vi.fn().mockResolvedValue(user);
    const comparePasswords = vi.fn().mockResolvedValue(false);
    vi.doMock('../services/auth', () => ({
      comparePasswords,
      generateToken: vi.fn(),
    }));

    const authRoutes = (await import('./auth')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/user', authRoutes);

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: mockUser.email, password: 'wrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid credentials');
    expect(res.body).toHaveProperty('details', 'Incorrect password');
    expect(res.body).toHaveProperty('attemptsLeft');
    expect(user.save).toHaveBeenCalled();
  });

  it('should lock account after 100 failed attempts', async () => {
    const user = {
      ...mockUser,
      failedLoginAttempts: 99,
      isLocked: false,
      save: vi.fn().mockResolvedValue(undefined),
    };
    User.findOne = vi.fn().mockResolvedValue(user);
    const comparePasswords = vi.fn().mockResolvedValue(false);
    vi.doMock('../services/auth', () => ({
      comparePasswords,
      generateToken: vi.fn(),
    }));

    const authRoutes = (await import('./auth')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/user', authRoutes);

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: mockUser.email, password: 'wrongPassword' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error', 'Account temporarily locked');
    expect(res.body).toHaveProperty(
      'details',
      'Too many failed login attempts'
    );
    expect(user.isLocked).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });

  it('should return 400 for validation error', async () => {
    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: 'not-an-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation error');
    expect(res.body).toHaveProperty('details');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('should return 500 for unexpected server error', async () => {
    User.findOne = vi.fn().mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .post('/api/user/auth')
      .send({ email: mockUser.email, password: 'server' });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Server error');
    expect(res.body).toHaveProperty('details');
  });
});

// Validation tests for loginSchema (остаются без изменений)
describe('loginSchema', () => {
  it('should validate correct email and password', () => {
    const data = { email: 'user@example.com', password: 'abcdef' };
    expect(() => loginSchema.parse(data)).not.toThrow();
  });

  it('should throw error for invalid email', () => {
    const data = { email: 'not-an-email', password: 'abcdef' };
    expect(() => loginSchema.parse(data)).toThrow();
  });

  it('should throw error for short password', () => {
    const data = { email: 'user@example.com', password: '123' };
    expect(() => loginSchema.parse(data)).toThrow();
  });

  it('should throw error if email is missing', () => {
    const data = { password: 'abcdef' };
    expect(() => loginSchema.parse(data)).toThrow();
  });

  it('should throw error if password is missing', () => {
    const data = { email: 'user@example.com' };
    expect(() => loginSchema.parse(data)).toThrow();
  });
});
