import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import apiRouter from './routes/index';
import { corsMiddleware } from './config/cors';
import { runSeed } from './storage';

dotenv.config();

const app = express();
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Логирование запросов
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
      console.log(logLine);
    }
  });

  next();
});

// Подключаем роуты
app.use('/api', apiRouter);

// Глобальный обработчик ошибок
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  console.error('Unhandled Error:', err);
  res.status(status).json({ message });
});

const port = process.env.PORT || 5000;
app.listen(port, async () => {
  console.log(`Serving on port ${port}`);
  await runSeed();
});

export { app };
