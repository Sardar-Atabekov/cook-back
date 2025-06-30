import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { registerRoutes } from './routers/registerRoutes';
import { setupVite, serveStatic, log } from './vite';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: any;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + '…';
      log(logLine);
    }
  });

  next();
});

console.log('Connecting to MongoDB...', process.env.MONGODB_DB);

(async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('Missing MONGODB_URI in environment');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'userdb',
    });

    log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    console.error('Unhandled Error:', err);
    res.status(status).json({ message });
  });

  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT || 5000;
  server.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();

export { app };
