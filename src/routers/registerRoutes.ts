import type { Express } from 'express';
import { createServer, type Server } from 'http';
import apiRouter from '../routes';

export async function registerRoutes(app: Express): Promise<Server> {
  app.use('/api', apiRouter);
  const httpServer = createServer(app);
  return httpServer;
}
