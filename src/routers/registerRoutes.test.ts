import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { registerRoutes } from './registerRoutes';

describe('registerRoutes', () => {
  it('should register /api routes and return a server instance', async () => {
    const app = express();
    const server = await registerRoutes(app);

    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');

    server.close();
  });
});
