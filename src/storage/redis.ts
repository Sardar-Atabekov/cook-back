import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('Redis connected');
});
redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Типизированные методы для работы с кэшем
export const cache = {
  async get(key: string): Promise<string | null> {
    return await redis.get(key);
  },

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    return await redis.setex(key, seconds, value);
  },

  async del(key: string): Promise<number> {
    return await redis.del(key);
  },

  // Утилиты для управления кэшем
  async clearAll(): Promise<void> {
    await redis.flushall();
  },

  async clearByPattern(pattern: string): Promise<number> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    return 0;
  },

  async getStats(): Promise<{ keys: number; memory: string }> {
    const info = await redis.info('memory');
    const keys = await redis.dbsize();
    return { keys, memory: info };
  },

  // Очистка кэша рецептов
  async clearRecipesCache(): Promise<number> {
    return await this.clearByPattern('recipes:*');
  },

  // Очистка кэша ингредиентов
  async clearIngredientsCache(): Promise<number> {
    return await this.clearByPattern('categories:*');
  },

  // Очистка кэша тегов
  async clearTagsCache(): Promise<number> {
    return await this.clearByPattern('tags:*');
  },

  async getRedisStats() {
    const keys = await redis.dbsize();
    const info = await redis.info('memory');
    // memory: used_memory_human: ...
    const match = info.match(/used_memory_human:(\S+)/);
    return {
      keys,
      usedMemory: match ? match[1] : 'unknown',
    };
  },

  /**
   * Кэширует статистику ингредиентов для рецепта
   */
  async cacheIngredientStats(recipeId: number, stats: any, ttl: number = 3600) {
    const key = `ingredient_stats:${recipeId}`;
    await redis.setex(key, ttl, JSON.stringify(stats));
  },

  /**
   * Получает кэшированную статистику ингредиентов для рецепта
   */
  async getCachedIngredientStats(recipeId: number) {
    const key = `ingredient_stats:${recipeId}`;
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  },

  /**
   * Кэширует результаты подсчётов рецептов
   */
  async cacheRecipeCount(params: any, count: number, ttl: number = 1800) {
    const key = `recipe_count:${JSON.stringify(params)}`;
    await redis.setex(key, ttl, count.toString());
  },

  /**
   * Получает кэшированный подсчёт рецептов
   */
  async getCachedRecipeCount(params: any) {
    const key = `recipe_count:${JSON.stringify(params)}`;
    const cached = await redis.get(key);
    return cached ? parseInt(cached, 10) : null;
  },

  /**
   * Очищает кэш статистики ингредиентов
   */
  async clearIngredientStatsCache() {
    const keys = await redis.keys('ingredient_stats:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  },

  /**
   * Очищает кэш подсчётов рецептов
   */
  async clearRecipeCountCache() {
    const keys = await redis.keys('recipe_count:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  },
};

export { redis };
