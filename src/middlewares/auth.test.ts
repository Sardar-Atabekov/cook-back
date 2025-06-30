import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth } from './auth';

const app = express();
app.get('/protected', requireAuth, (req, res) => {
  res.json({ ok: true, user: (req as any).user });
});

describe('requireAuth middleware', () => {
  it('should return 401 if no token provided', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'No token');
  });

  it('should return 401 if token is invalid', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Invalid token');
  });

  it('should call next and set req.user if token is valid', async () => {
    const payload = { id: 'user1', email: 'test@example.com' };
    const token = jwt.sign(payload, 'dev-secret');
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body.user).toMatchObject(payload);
  });
});
