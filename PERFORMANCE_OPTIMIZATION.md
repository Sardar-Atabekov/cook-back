# Оптимизация производительности

## Проблемы производительности

### Медленные запросы

- `getRecipes`: 1.4s SQL + 1.3s подсчёт = 4s общее время
- Сложные JOIN'ы с подзапросами для подсчёта ингредиентов
- Дублирование логики между `getRecipes` и `countRecipes`

## Применённые оптимизации

### 1. Оптимизация SQL-запросов

- **Объединение логики**: Убрал дублирование между получением данных и подсчётом
- **Упрощение подзапросов**: Заменил сложные подзапросы на более эффективные
- **Использование `ANY()`**: Заменил `IN` на `ANY()` для лучшей производительности
- **LEFT JOIN вместо INNER JOIN**: Для случаев без ингредиентов

### 2. Индексы базы данных

```sql
-- Композитный индекс для фильтрации по языку и сортировки
CREATE INDEX idx_recipes_lang_id ON recipes(lang, id DESC);

-- Индекс для GROUP BY и подсчётов
CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Частичный индекс для активных рецептов
CREATE INDEX idx_recipe_ingredients_active ON recipe_ingredients(recipe_id)
WHERE ingredient_id IS NOT NULL;

-- Индекс для поиска по названию с языком
CREATE INDEX idx_recipes_title_lang ON recipes(title, lang);

-- Индекс для подсчётов популярности
CREATE INDEX idx_recipes_viewed ON recipes(viewed DESC);
```

### 3. Кэширование

- **Кэширование подсчётов**: `cacheRecipeCount()` - 30 минут TTL
- **Кэширование статистики ингредиентов**: `cacheIngredientStats()` - 1 час TTL
- **Умное кэширование**: Разные TTL для разных типов данных

### 4. Мониторинг производительности

- Логирование медленных SQL-запросов (>300ms)
- Таймеры для каждого этапа обработки
- Метрики кэш-хитов

## Применение оптимизаций

### 1. Применить индексы

```bash
npm run db:indexes
```

### 2. Мониторинг кэша

```bash
# Статистика кэша
GET /api/recipes/cache?action=stats

# Очистка кэша
GET /api/recipes/cache?action=clear-all
GET /api/recipes/cache?action=clear-recipe-counts
GET /api/recipes/cache?action=clear-ingredient-stats
```

### 3. Проверка производительности

```bash
# Тестовый запрос
curl "http://localhost:3000/api/recipes/recipes?lang=ru&limit=20&offset=0"
```

## Ожидаемые улучшения

### До оптимизации

- `getRecipes-sql`: 1.436s
- `getRecipes-totalCount`: 1.275s
- `getRecipes-total`: 4.060s

### После оптимизации

- `getRecipes-sql`: ~200-500ms
- `getRecipes-totalCount`: ~50-100ms (с кэшем)
- `getRecipes-total`: ~300-800ms

## Дополнительные рекомендации

### 1. Мониторинг

- Настроить алерты на медленные запросы (>1s)
- Отслеживать кэш-хиты vs кэш-миссы
- Мониторить размер кэша Redis

### 2. Дальнейшие оптимизации

- **Материализованные представления** для сложных подсчётов
- **Партиционирование** таблиц по языку
- **Read replicas** для тяжёлых запросов
- **Connection pooling** для PostgreSQL

### 3. Настройка PostgreSQL

```sql
-- Увеличить shared_buffers
ALTER SYSTEM SET shared_buffers = '256MB';

-- Настроить work_mem для сложных запросов
ALTER SYSTEM SET work_mem = '16MB';

-- Включить параллельные запросы
ALTER SYSTEM SET max_parallel_workers_per_gather = 2;
```

## Troubleshooting

### Медленные запросы остаются

1. Проверить, применены ли индексы: `\d+ recipes`
2. Анализировать планы запросов: `EXPLAIN ANALYZE`
3. Проверить размер таблиц: `SELECT count(*) FROM recipes`

### Проблемы с кэшем

1. Проверить подключение к Redis
2. Очистить кэш: `GET /api/recipes/cache?action=clear-all`
3. Проверить память Redis: `INFO memory`

### Высокая нагрузка на БД

1. Увеличить TTL кэша
2. Добавить больше индексов
3. Рассмотреть read replicas
