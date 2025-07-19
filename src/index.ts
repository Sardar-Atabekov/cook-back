import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import compression from 'compression';
import apiRouter from './routes/index';
import { corsMiddleware } from './config/cors';
import { cache } from './storage/redis';

dotenv.config();

const app = express();
app.use(compression());
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Простая in-memory статистика по времени выполнения запросов
const metrics: Record<
  string,
  { count: number; total: number; max: number; min: number }
> = {};

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
      if (duration > 500) {
        console.warn(`[SLOW REQUEST] ${req.method} ${path} took ${duration}ms`);
      }
      if (duration > 2000) {
        console.error(
          `[ALERT: SLOW REQUEST >2s] ${req.method} ${path} took ${duration}ms`
        );
      }
      // Метрики
      const key = `${req.method} ${path}`;
      if (!metrics[key])
        metrics[key] = { count: 0, total: 0, max: 0, min: Infinity };
      metrics[key].count++;
      metrics[key].total += duration;
      metrics[key].max = Math.max(metrics[key].max, duration);
      metrics[key].min = Math.min(metrics[key].min, duration);
    }
  });

  next();
});

app.use('/api', apiRouter);

// Эндпоинт для просмотра метрик
app.get('/api/admin/metrics', (req, res) => {
  const result = Object.entries(metrics).map(([key, val]) => ({
    endpoint: key,
    count: val.count,
    avg: Math.round(val.total / val.count),
    max: val.max,
    min: val.min === Infinity ? 0 : val.min,
  }));
  res.json(result);
});

// Эндпоинт для мониторинга памяти
app.get('/api/admin/memory', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
    external: Math.round(mem.external / 1024 / 1024) + ' MB',
    arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024) + ' MB',
  });
});

// Эндпоинт для мониторинга Redis
app.get('/api/admin/redis-stats', async (req, res) => {
  const stats = await cache.getRedisStats();
  res.json(stats);
});

// Глобальный обработчик ошибок
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  console.error('Unhandled Error:', err);
  res.status(status).json({ message });
});

const port = process.env.PORT || 5000;
app.listen(port, async () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
  try {
    // await runSeed();
    // await seedTags();
    console.log('🌱 Database seeded successfully');
  } catch (err) {
    console.error('❌ Failed to seed database', err);
  }
});

export { app };
