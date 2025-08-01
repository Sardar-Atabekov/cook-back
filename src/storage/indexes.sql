-- =====================================================================
-- КОМПЛЕКСНАЯ ОПТИМИЗАЦИЯ БАЗЫ ДАННЫХ ДЛЯ СИСТЕМЫ РЕЦЕПТОВ
-- PostgreSQL 13+ с поддержкой материализованных представлений
-- Версия: 2.0 (Объединенная и улучшенная)
-- =====================================================================

-- =====================================================================
-- РАЗДЕЛ 1: ОСНОВНЫЕ ИНДЕКСЫ ДЛЯ ВЫСОКОЙ ПРОИЗВОДИТЕЛЬНОСТИ
-- =====================================================================

-- 1.1 Таблица recipes - критически важные индексы
-- ---------------------------------------------------------------------

-- Основной композитный индекс для фильтрации по языку + сортировка
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_id_desc 
    ON recipes(lang, id DESC);

-- Полнотекстовый поиск с поддержкой триграмм для гибкости
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_title_gin_trgm 
    ON recipes USING gin(title gin_trgm_ops);

-- Дополнительный полнотекстовый индекс для точного поиска
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_title_tsv
    ON recipes USING gin(to_tsvector('simple', title));

-- Композитный индекс для поиска по языку + названию
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_title_lower 
    ON recipes(lang, lower(title) text_pattern_ops);

-- Индексы для сортировки и популярности
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_viewed_desc 
    ON recipes(lang, viewed DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_created_desc 
    ON recipes(lang, created_at DESC NULLS LAST);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_rating_desc 
    ON recipes(lang, rating DESC NULLS LAST);

-- Покрывающий индекс для избежания дополнительных обращений к таблице
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipes_lang_covering 
    ON recipes(lang, id DESC) 
    INCLUDE (title, description, prep_time, rating, difficulty, image_url, created_at, viewed);

-- 1.2 Таблица recipe_ingredients - критически важные композитные индексы
-- ---------------------------------------------------------------------

-- Основной композитный индекс для JOIN'ов и фильтрации
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_recipe_ingredient 
    ON recipe_ingredients(recipe_id, ingredient_id);

-- Обратный индекс для поиска рецептов по ингредиентам
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_ingredient_recipe 
    ON recipe_ingredients(ingredient_id, recipe_id);

-- Отдельные индексы для быстрых GROUP BY операций
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_recipe_id 
    ON recipe_ingredients(recipe_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_ingredient_id 
    ON recipe_ingredients(ingredient_id);

-- Частичный индекс для валидных записей
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_ingredients_valid 
    ON recipe_ingredients(recipe_id, ingredient_id) 
    WHERE ingredient_id IS NOT NULL AND recipe_id IS NOT NULL;

-- 1.3 Связующие таблицы тегов - оптимизация для EXISTS и JOIN'ов
-- ---------------------------------------------------------------------

-- Диеты
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_diets_recipe_diet 
    ON recipe_diets(recipe_id, diet_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_diets_diet_recipe 
    ON recipe_diets(diet_id, recipe_id);

-- Типы блюд
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_meal_types_recipe_meal 
    ON recipe_meal_types(recipe_id, meal_type_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_meal_types_meal_recipe 
    ON recipe_meal_types(meal_type_id, recipe_id);

-- Кухни
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_kitchens_recipe_kitchen 
    ON recipe_kitchens(recipe_id, kitchen_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recipe_kitchens_kitchen_recipe 
    ON recipe_kitchens(kitchen_id, recipe_id);

-- 1.4 Пользовательские данные
-- ---------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_recipes_user_recipe 
    ON saved_recipes(user_id, recipe_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_recipes_recipe_user 
    ON saved_recipes(recipe_id, user_id);

-- 1.5 Справочные таблицы
-- ---------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingredients_name_lang 
    ON ingredients(lower(name), lang) WHERE name IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meal_types_tag_lang 
    ON meal_types(tag, lang) WHERE tag IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_diets_tag_lang 
    ON diets(tag, lang) WHERE tag IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kitchens_tag_lang 
    ON kitchens(tag, lang) WHERE tag IS NOT NULL;

-- =====================================================================
-- РАЗДЕЛ 2: МАТЕРИАЛИЗОВАННЫЕ ПРЕДСТАВЛЕНИЯ ДЛЯ ПРЕДВЫЧИСЛЕНИЙ
-- =====================================================================

-- 2.1 Представление для точного совпадения ингредиентов
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS recipe_ingredient_perfect_matches CASCADE;

CREATE MATERIALIZED VIEW recipe_ingredient_perfect_matches AS
SELECT 
    ri.recipe_id,
    r.lang,
    r.title,
    r.description,
    r.prep_time,
    r.rating,
    r.difficulty,
    r.image_url,
    r.source_url,
    r.created_at,
    r.viewed,
    array_agg(ri.ingredient_id ORDER BY ri.ingredient_id) as ingredient_ids,
    array_to_string(array_agg(ri.ingredient_id ORDER BY ri.ingredient_id), ',') as ingredient_key,
    count(ri.ingredient_id) as ingredient_count
FROM recipe_ingredients ri
INNER JOIN recipes r ON ri.recipe_id = r.id
WHERE ri.ingredient_id IS NOT NULL 
  AND r.id IS NOT NULL
GROUP BY ri.recipe_id, r.lang, r.title, r.description, r.prep_time, 
         r.rating, r.difficulty, r.image_url, r.source_url, r.created_at, r.viewed;

-- Индексы для материализованного представления
CREATE UNIQUE INDEX idx_ripm_recipe_id ON recipe_ingredient_perfect_matches(recipe_id);
CREATE INDEX idx_ripm_lang_key ON recipe_ingredient_perfect_matches(lang, ingredient_key);
CREATE INDEX idx_ripm_lang_count ON recipe_ingredient_perfect_matches(lang, ingredient_count);
CREATE INDEX idx_ripm_lang_rating ON recipe_ingredient_perfect_matches(lang, rating DESC NULLS LAST);

-- 2.2 Представление для статистики ингредиентов
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS ingredient_usage_stats CASCADE;

CREATE MATERIALIZED VIEW ingredient_usage_stats AS
SELECT 
    i.id as ingredient_id,
    i.name,
    i.lang,
    COUNT(ri.recipe_id) as recipe_count,
    COUNT(ri.recipe_id) * 100.0 / (SELECT COUNT(*) FROM recipes WHERE lang = i.lang) as usage_percentage
FROM ingredients i
LEFT JOIN recipe_ingredients ri ON i.id = ri.ingredient_id
WHERE i.name IS NOT NULL
GROUP BY i.id, i.name, i.lang;

-- Индексы для статистики ингредиентов
CREATE UNIQUE INDEX idx_ius_ingredient_id ON ingredient_usage_stats(ingredient_id);
CREATE INDEX idx_ius_lang_count ON ingredient_usage_stats(lang, recipe_count DESC);
CREATE INDEX idx_ius_name_lang ON ingredient_usage_stats(lower(name), lang);

-- =====================================================================
-- РАЗДЕЛ 3: ФУНКЦИИ ДЛЯ ОПТИМИЗИРОВАННОГО ПОИСКА
-- =====================================================================

-- 3.1 Функция для поиска рецептов с точным совпадением ингредиентов
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_recipes_with_perfect_ingredient_match(
    p_ingredient_ids integer[],
    p_lang text,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0,
    p_search text DEFAULT NULL,
    p_sort_by text DEFAULT 'id_desc'
)
RETURNS TABLE (
    id integer,
    title text,
    description text,
    prep_time text,
    rating numeric,
    difficulty text,
    image_url text,
    source_url text,
    created_at timestamp,
    viewed integer,
    matched_count integer,
    match_percentage integer,
    total_count bigint
) AS $$
DECLARE
    ingredient_key text;
    search_condition text := '';
    sort_condition text;
BEGIN
    -- Создаем ключ для поиска
    SELECT array_to_string(array_agg(unnest ORDER BY unnest), ',') 
    INTO ingredient_key
    FROM unnest(p_ingredient_ids);
    
    -- Формируем условие поиска
    IF p_search IS NOT NULL AND trim(p_search) != '' THEN
        search_condition := format(' AND (ripm.title ILIKE ''%%%s%%'' OR ripm.description ILIKE ''%%%s%%'')', 
                                 replace(trim(p_search), '''', ''''''), 
                                 replace(trim(p_search), '''', ''''''));
    END IF;
    
    -- Формируем условие сортировки
    sort_condition := CASE p_sort_by
        WHEN 'rating_desc' THEN 'ripm.rating DESC NULLS LAST'
        WHEN 'created_desc' THEN 'ripm.created_at DESC NULLS LAST'
        WHEN 'viewed_desc' THEN 'ripm.viewed DESC NULLS LAST'
        WHEN 'title_asc' THEN 'ripm.title ASC'
        ELSE 'ripm.recipe_id DESC'
    END;
    
    -- Выполняем оптимизированный запрос
    RETURN QUERY EXECUTE format('
        SELECT 
            ripm.recipe_id::integer,
            ripm.title,
            ripm.description,
            ripm.prep_time,
            ripm.rating,
            ripm.difficulty,
            ripm.image_url,
            ripm.source_url,
            ripm.created_at,
            ripm.viewed,
            ripm.ingredient_count::integer as matched_count,
            100::integer as match_percentage,
            COUNT(*) OVER()::bigint as total_count
        FROM recipe_ingredient_perfect_matches ripm
        WHERE ripm.ingredient_key = $1
          AND ripm.lang = $2
          %s
        ORDER BY %s
        LIMIT $3 OFFSET $4
    ', search_condition, sort_condition)
    USING ingredient_key, p_lang, p_limit, p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3.2 Функция для поиска рецептов с частичным совпадением ингредиентов
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_recipes_with_partial_ingredient_match(
    p_ingredient_ids integer[],
    p_lang text,
    p_min_match_percentage integer DEFAULT 50,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0,
    p_search text DEFAULT NULL,
    p_sort_by text DEFAULT 'match_desc'
)
RETURNS TABLE (
    id integer,
    title text,
    description text,
    prep_time text,
    rating numeric,
    difficulty text,
    image_url text,
    source_url text,
    created_at timestamp,
    viewed integer,
    matched_count integer,
    total_ingredients integer,
    match_percentage integer,
    total_count bigint
) AS $$
DECLARE
    search_condition text := '';
    sort_condition text;
BEGIN
    -- Формируем условие поиска
    IF p_search IS NOT NULL AND trim(p_search) != '' THEN
        search_condition := format(' AND (r.title ILIKE ''%%%s%%'' OR r.description ILIKE ''%%%s%%'')', 
                                 replace(trim(p_search), '''', ''''''), 
                                 replace(trim(p_search), '''', ''''''));
    END IF;
    
    -- Формируем условие сортировки
    sort_condition := CASE p_sort_by
        WHEN 'rating_desc' THEN 'r.rating DESC NULLS LAST, match_percentage DESC'
        WHEN 'created_desc' THEN 'r.created_at DESC NULLS LAST'
        WHEN 'viewed_desc' THEN 'r.viewed DESC NULLS LAST'
        WHEN 'title_asc' THEN 'r.title ASC'
        ELSE 'match_percentage DESC, matched_count DESC'
    END;
    
    RETURN QUERY EXECUTE format('
        WITH recipe_matches AS (
            SELECT 
                r.id,
                r.title,
                r.description,
                r.prep_time,
                r.rating,
                r.difficulty,
                r.image_url,
                r.source_url,
                r.created_at,
                r.viewed,
                COUNT(CASE WHEN ri.ingredient_id = ANY($1) THEN 1 END) as matched_count,
                COUNT(ri.ingredient_id) as total_ingredients,
                ROUND((COUNT(CASE WHEN ri.ingredient_id = ANY($1) THEN 1 END) * 100.0 / COUNT(ri.ingredient_id))::numeric, 0)::integer as match_percentage
            FROM recipes r
            INNER JOIN recipe_ingredients ri ON r.id = ri.recipe_id
            WHERE r.lang = $2
              AND EXISTS (
                  SELECT 1 FROM recipe_ingredients ri2 
                  WHERE ri2.recipe_id = r.id 
                    AND ri2.ingredient_id = ANY($1)
              )
              %s
            GROUP BY r.id, r.title, r.description, r.prep_time, r.rating, 
                     r.difficulty, r.image_url, r.source_url, r.created_at, r.viewed
            HAVING ROUND((COUNT(CASE WHEN ri.ingredient_id = ANY($1) THEN 1 END) * 100.0 / COUNT(ri.ingredient_id))::numeric, 0) >= $3
        )
        SELECT 
            rm.*,
            COUNT(*) OVER()::bigint as total_count
        FROM recipe_matches rm
        ORDER BY %s
        LIMIT $4 OFFSET $5
    ', search_condition, sort_condition)
    USING p_ingredient_ids, p_lang, p_min_match_percentage, p_limit, p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3.3 Универсальная функция для поиска рецептов с фильтрами
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_recipes_advanced(
    p_lang text,
    p_search text DEFAULT NULL,
    p_ingredient_ids integer[] DEFAULT NULL,
    p_diet_ids integer[] DEFAULT NULL,
    p_meal_type_ids integer[] DEFAULT NULL,
    p_kitchen_ids integer[] DEFAULT NULL,
    p_min_rating numeric DEFAULT NULL,
    p_max_prep_time integer DEFAULT NULL,
    p_difficulty text DEFAULT NULL,
    p_sort_by text DEFAULT 'id_desc',
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id integer,
    title text,
    description text,
    prep_time text,
    rating numeric,
    difficulty text,
    image_url text,
    source_url text,
    created_at timestamp,
    viewed integer,
    total_count bigint
) AS $$
DECLARE
    where_conditions text[] := ARRAY['r.lang = $1'];
    search_condition text := '';
    sort_condition text;
    condition_counter integer := 2;
BEGIN
    -- Формируем условия WHERE
    IF p_search IS NOT NULL AND trim(p_search) != '' THEN
        where_conditions := array_append(where_conditions, 
            format('(r.title ILIKE ''%%%s%%'' OR r.description ILIKE ''%%%s%%'')', 
                   replace(trim(p_search), '''', ''''''), 
                   replace(trim(p_search), '''', '''''')));
    END IF;
    
    IF p_ingredient_ids IS NOT NULL AND array_length(p_ingredient_ids, 1) > 0 THEN
        where_conditions := array_append(where_conditions, 
            format('EXISTS (SELECT 1 FROM recipe_ingredients ri WHERE ri.recipe_id = r.id AND ri.ingredient_id = ANY($%s))', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_diet_ids IS NOT NULL AND array_length(p_diet_ids, 1) > 0 THEN
        where_conditions := array_append(where_conditions, 
            format('EXISTS (SELECT 1 FROM recipe_diets rd WHERE rd.recipe_id = r.id AND rd.diet_id = ANY($%s))', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_meal_type_ids IS NOT NULL AND array_length(p_meal_type_ids, 1) > 0 THEN
        where_conditions := array_append(where_conditions, 
            format('EXISTS (SELECT 1 FROM recipe_meal_types rmt WHERE rmt.recipe_id = r.id AND rmt.meal_type_id = ANY($%s))', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_kitchen_ids IS NOT NULL AND array_length(p_kitchen_ids, 1) > 0 THEN
        where_conditions := array_append(where_conditions, 
            format('EXISTS (SELECT 1 FROM recipe_kitchens rk WHERE rk.recipe_id = r.id AND rk.kitchen_id = ANY($%s))', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_min_rating IS NOT NULL THEN
        where_conditions := array_append(where_conditions, format('r.rating >= $%s', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_max_prep_time IS NOT NULL THEN
        where_conditions := array_append(where_conditions, format('EXTRACT(MINUTES FROM r.prep_time::interval) <= $%s', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    IF p_difficulty IS NOT NULL THEN
        where_conditions := array_append(where_conditions, format('r.difficulty = $%s', condition_counter));
        condition_counter := condition_counter + 1;
    END IF;
    
    -- Формируем условие сортировки
    sort_condition := CASE p_sort_by
        WHEN 'rating_desc' THEN 'r.rating DESC NULLS LAST'
        WHEN 'created_desc' THEN 'r.created_at DESC NULLS LAST'
        WHEN 'viewed_desc' THEN 'r.viewed DESC NULLS LAST'
        WHEN 'title_asc' THEN 'r.title ASC'
        ELSE 'r.id DESC'
    END;
    
    -- Выполняем запрос
    RETURN QUERY EXECUTE format('
        SELECT 
            r.id,
            r.title,
            r.description,
            r.prep_time,
            r.rating,
            r.difficulty,
            r.image_url,
            r.source_url,
            r.created_at,
            r.viewed,
            COUNT(*) OVER()::bigint as total_count
        FROM recipes r
        WHERE %s
        ORDER BY %s
        LIMIT $%s OFFSET $%s
    ', array_to_string(where_conditions, ' AND '), sort_condition, condition_counter, condition_counter + 1)
    USING p_lang, p_ingredient_ids, p_diet_ids, p_meal_type_ids, p_kitchen_ids, 
          p_min_rating, p_max_prep_time, p_difficulty, p_limit, p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- РАЗДЕЛ 4: СИСТЕМА ОБНОВЛЕНИЯ МАТЕРИАЛИЗОВАННЫХ ПРЕДСТАВЛЕНИЙ
-- =====================================================================

-- 4.1 Функции для обновления материализованных представлений
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY recipe_ingredient_perfect_matches;
    REFRESH MATERIALIZED VIEW CONCURRENTLY ingredient_usage_stats;
    
    -- Логируем обновление
    INSERT INTO system_log (event_type, message, created_at) 
    VALUES ('materialized_view_refresh', 'All materialized views refreshed', NOW())
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 4.2 Функции для триггеров
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_refresh_materialized_views()
RETURNS trigger AS $$
BEGIN
    -- Асинхронное уведомление для обновления представлений
    PERFORM pg_notify('refresh_materialized_views', 
        json_build_object(
            'table', TG_TABLE_NAME,
            'operation', TG_OP,
            'timestamp', extract(epoch from now())
        )::text
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4.3 Создание триггеров
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_recipes_refresh ON recipes;
CREATE TRIGGER trigger_recipes_refresh
    AFTER INSERT OR UPDATE OR DELETE ON recipes
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_refresh_materialized_views();

DROP TRIGGER IF EXISTS trigger_recipe_ingredients_refresh ON recipe_ingredients;
CREATE TRIGGER trigger_recipe_ingredients_refresh
    AFTER INSERT OR UPDATE OR DELETE ON recipe_ingredients
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_refresh_materialized_views();

DROP TRIGGER IF EXISTS trigger_ingredients_refresh ON ingredients;
CREATE TRIGGER trigger_ingredients_refresh
    AFTER INSERT OR UPDATE OR DELETE ON ingredients
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_refresh_materialized_views();

-- =====================================================================
-- РАЗДЕЛ 5: МОНИТОРИНГ И СТАТИСТИКА
-- =====================================================================

-- 5.1 Создание таблицы для логирования системных событий
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_log (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_log_event_type_created 
    ON system_log(event_type, created_at DESC);

-- 5.2 Функции для мониторинга производительности
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_detailed_index_usage_stats()
RETURNS TABLE (
    schemaname text,
    tablename text,
    indexname text,
    idx_scan bigint,
    idx_tup_read bigint,
    idx_tup_fetch bigint,
    index_size text,
    table_size text,
    usage_ratio numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.schemaname,
        s.tablename,
        s.indexname,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
        pg_size_pretty(pg_relation_size(s.relid)) as table_size,
        CASE 
            WHEN s.idx_scan > 0 THEN ROUND((s.idx_tup_read::numeric / s.idx_scan), 2)
            ELSE 0
        END as usage_ratio
    FROM pg_stat_user_indexes s
    WHERE s.schemaname = 'public'
      AND (s.tablename ~ 'recipe|ingredient|diet|meal|kitchen|saved')
    ORDER BY s.idx_scan DESC, pg_relation_size(s.indexrelid) DESC;
END;
$$ LANGUAGE plpgsql;

-- 5.3 Функция для анализа медленных запросов
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_slow_queries_analysis()
RETURNS TABLE (
    query_hash text,
    query_sample text,
    calls bigint,
    total_time_ms numeric,
    mean_time_ms numeric,
    max_time_ms numeric,
    rows_per_call numeric,
    hit_ratio numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        substring(md5(ps.query), 1, 10) as query_hash,
        substring(ps.query, 1, 100) || '...' as query_sample,
        ps.calls,
        ROUND(ps.total_exec_time::numeric, 2) as total_time_ms,
        ROUND(ps.mean_exec_time::numeric, 2) as mean_time_ms,
        ROUND(ps.max_exec_time::numeric, 2) as max_time_ms,
        CASE 
            WHEN ps.calls > 0 THEN ROUND((ps.rows::numeric / ps.calls), 2)
            ELSE 0
        END as rows_per_call,
        CASE 
            WHEN (ps.shared_blks_hit + ps.shared_blks_read) > 0 
            THEN ROUND((ps.shared_blks_hit::numeric / (ps.shared_blks_hit + ps.shared_blks_read) * 100), 2)
            ELSE 0
        END as hit_ratio
    FROM pg_stat_statements ps
    WHERE ps.query ~ 'recipe|ingredient|diet|meal|kitchen'
      AND ps.mean_exec_time > 50 -- запросы медленнее 50ms
    ORDER BY ps.mean_exec_time DESC
    LIMIT 25;
END;
$$ LANGUAGE plpgsql;

-- 5.4 Функция для проверки состояния материализованных представлений
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_materialized_views_status()
RETURNS TABLE (
    view_name text,
    is_populated boolean,
    row_count bigint,
    size_pretty text,
    last_refresh timestamp
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::text as view_name,
        c.relispopulated as is_populated,
        COALESCE(s.n_tup_ins + s.n_tup_upd + s.n_tup_del, 0) as row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty,
        s.stats_reset as last_refresh
    FROM pg_class c
    LEFT JOIN pg_stat_user_tables s ON c.oid = s.relid
    WHERE c.relkind = 'm' -- материализованные представления
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.relname ~ 'recipe|ingredient'
    ORDER BY c.relname;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- РАЗДЕЛ 6: ПРОЦЕДУРЫ ОБСЛУЖИВАНИЯ
-- =====================================================================

-- 6.1 Процедура для комплексного обслуживания базы
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION perform_database_maintenance(
    p_vacuum_analyze boolean DEFAULT true,
    p_refresh_views boolean DEFAULT true,
    p_update_stats boolean DEFAULT true
)
RETURNS TABLE (
    operation text,
    status text,
    duration_ms bigint,
    details text
) AS $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration_ms bigint;
BEGIN
    -- Обновление статистик планировщика
    IF p_update_stats THEN
        start_time := clock_timestamp();
        
        ANALYZE recipes;
        ANALYZE recipe_ingredients;
        ANALYZE ingredients;
        ANALYZE recipe_diets;
        ANALYZE recipe_meal_types;
        ANALYZE recipe_kitchens;
        ANALYZE saved_recipes;
        
        end_time := clock_timestamp();
        duration_ms := EXTRACT(milliseconds FROM (end_time - start_time))::bigint;
        
        RETURN QUERY SELECT 'ANALYZE'::text, 'SUCCESS'::text, duration_ms, 'Statistics updated for all tables'::text;
    END IF;
    
    -- VACUUM и анализ
    IF p_vacuum_analyze THEN
        start_time := clock_timestamp();
        
        VACUUM ANALYZE recipes;
        VACUUM ANALYZE recipe_ingredients;
        VACUUM ANALYZE ingredients;
        
        end_time := clock_timestamp();
        duration_ms := EXTRACT(milliseconds FROM (end_time - start_time))::bigint;
        
        RETURN QUERY SELECT 'VACUUM ANALYZE'::text, 'SUCCESS'::text, duration_ms, 'Main tables vacuumed and analyzed'::text;
    END IF;
    
    -- Обновление материализованных представлений
    IF p_refresh_views THEN
        start_time := clock_timestamp();
        
        BEGIN
            PERFORM refresh_all_materialized_views();
            end_time := clock_timestamp();
            duration_ms := EXTRACT(milliseconds FROM (end_time - start_time))::bigint;
            
            RETURN QUERY SELECT 'REFRESH MATERIALIZED VIEWS'::text, 'SUCCESS'::text, duration_ms, 'All materialized views refreshed'::text;
        EXCEPTION WHEN OTHERS THEN
            end_time := clock_timestamp();
            duration_ms := EXTRACT(milliseconds FROM (end_time - start_time))::bigint;
            
            RETURN QUERY SELECT 'REFRESH MATERIALIZED VIEWS'::text, 'ERROR'::text, duration_ms, SQLERRM::text;
        END;
    END IF;
END;
$ LANGUAGE plpgsql;

-- 6.2 Автоматическая очистка старых логов
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_logs(p_days_to_keep integer DEFAULT 30)
RETURNS TABLE (
    operation text,
    deleted_rows bigint,
    status text
) AS $
DECLARE
    deleted_count bigint;
BEGIN
    DELETE FROM system_log 
    WHERE created_at < NOW() - INTERVAL '1 day' * p_days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN QUERY SELECT 'CLEANUP_LOGS'::text, deleted_count, 'SUCCESS'::text;
END;
$ LANGUAGE plpgsql;

-- =====================================================================
-- РАЗДЕЛ 7: КОНФИГУРАЦИЯ И НАСТРОЙКИ
-- =====================================================================

-- 7.1 Рекомендуемые настройки PostgreSQL
-- ---------------------------------------------------------------------
/*
-- Настройки для postgresql.conf (требует перезапуска сервера):

-- === ПАМЯТЬ ===
shared_buffers = 256MB                    # 25% от доступной RAM
effective_cache_size = 1GB                # 75% от доступной RAM  
work_mem = 8MB                           # Для сортировки и хеширования
maintenance_work_mem = 128MB             # Для VACUUM, CREATE INDEX, REINDEX

-- === ДИСКОВЫЕ ОПЕРАЦИИ ===
random_page_cost = 1.1                  # Для SSD (по умолчанию 4.0 для HDD)
effective_io_concurrency = 200          # Для SSD (1 для HDD)
seq_page_cost = 1.0                     # Стоимость последовательного чтения

-- === ПЛАНИРОВЩИК ЗАПРОСОВ ===
default_statistics_target = 100         # Увеличить для лучшей статистики
constraint_exclusion = partition        # Для партиционирования
enable_partitionwise_join = on          # Оптимизация JOIN'ов на партициях
enable_partitionwise_aggregate = on     # Оптимизация агрегации на партициях

-- === ЛОГИРОВАНИЕ И МОНИТОРИНГ ===
log_min_duration_statement = 1000       # Логировать запросы > 1 секунды
log_checkpoints = on                     # Логировать checkpoints
log_lock_waits = on                      # Логировать ожидания блокировок
log_temp_files = 0                       # Логировать временные файлы
log_autovacuum_min_duration = 0          # Логировать autovacuum операции

-- === АВТОВАКУУМ ===
autovacuum = on                          # Включить автовакуум
autovacuum_max_workers = 3               # Количество worker'ов
autovacuum_naptime = 1min                # Интервал между запусками
autovacuum_vacuum_threshold = 50         # Минимум обновлений для VACUUM
autovacuum_analyze_threshold = 50        # Минимум обновлений для ANALYZE
autovacuum_vacuum_scale_factor = 0.1     # Процент изменений для VACUUM
autovacuum_analyze_scale_factor = 0.05   # Процент изменений для ANALYZE

-- === СОЕДИНЕНИЯ ===
max_connections = 100                    # Максимум подключений
shared_preload_libraries = 'pg_stat_statements'  # Для мониторинга запросов

-- === ПРОИЗВОДИТЕЛЬНОСТЬ ===
synchronous_commit = off                 # Для высокой производительности (осторожно!)
wal_buffers = 16MB                      # Буферы WAL
checkpoint_completion_target = 0.9       # Растянуть checkpoint'ы
max_wal_size = 2GB                      # Максимальный размер WAL
min_wal_size = 80MB                     # Минимальный размер WAL
*/

-- 7.2 Настройки для конкретных таблиц
-- ---------------------------------------------------------------------

-- Настройка autovacuum для часто обновляемых таблиц
ALTER TABLE recipes SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE recipe_ingredients SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE system_log SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

-- =====================================================================
-- РАЗДЕЛ 8: СОЗДАНИЕ ЗАДАЧ ДЛЯ РЕГУЛЯРНОГО ОБСЛУЖИВАНИЯ
-- =====================================================================

-- 8.1 Функция для создания расписания обслуживания (требует pg_cron)
-- ---------------------------------------------------------------------
/*
-- Установка pg_cron (выполнить от суперпользователя):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Ежедневное обновление материализованных представлений в 02:00
SELECT cron.schedule('refresh-materialized-views', '0 2 * * *', 'SELECT refresh_all_materialized_views();');

-- Еженедельное обслуживание базы данных в воскресенье в 03:00
SELECT cron.schedule('weekly-maintenance', '0 3 * * 0', 'SELECT perform_database_maintenance(true, true, true);');

-- Ежемесячная очистка старых логов (первого числа в 04:00)
SELECT cron.schedule('cleanup-logs', '0 4 1 * *', 'SELECT cleanup_old_logs(30);');

-- Просмотр активных задач:
-- SELECT * FROM cron.job;
*/

-- =====================================================================
-- РАЗДЕЛ 9: КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ И МОНИТОРИНГА
-- =====================================================================

-- 9.1 Скрипты для проверки состояния системы
-- ---------------------------------------------------------------------

-- Проверка общего состояния индексов
-- SELECT * FROM get_detailed_index_usage_stats();

-- Анализ медленных запросов
-- SELECT * FROM get_slow_queries_analysis();

-- Состояние материализованных представлений
-- SELECT * FROM check_materialized_views_status();

-- Выполнение полного обслуживания
-- SELECT * FROM perform_database_maintenance(true, true, true);

-- Очистка старых логов (за последние 30 дней)
-- SELECT * FROM cleanup_old_logs(30);

-- 9.2 Полезные запросы для мониторинга
-- ---------------------------------------------------------------------

-- Размеры таблиц и индексов
/*
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename ~ 'recipe|ingredient'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
*/

-- TOP 10 самых медленных запросов
/*
SELECT 
    substring(query, 1, 50) as short_query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements 
WHERE query ~ 'recipe|ingredient'
ORDER BY mean_exec_time DESC 
LIMIT 10;
*/

-- Статистика попаданий в кеш для индексов
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_blks_read,
    idx_blks_hit,
    CASE 
        WHEN idx_blks_read + idx_blks_hit > 0 
        THEN ROUND((idx_blks_hit::numeric / (idx_blks_read + idx_blks_hit)) * 100, 2)
        ELSE 0 
    END as hit_ratio_percent
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
  AND (tablename ~ 'recipe|ingredient')
ORDER BY hit_ratio_percent DESC;
*/

-- =====================================================================
-- РАЗДЕЛ 10: ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ ОПТИМИЗИРОВАННЫХ ФУНКЦИЙ
-- =====================================================================

-- 10.1 Примеры поиска рецептов
-- ---------------------------------------------------------------------

-- Поиск рецептов с точным совпадением ингредиентов
/*
SELECT * FROM get_recipes_with_perfect_ingredient_match(
    ARRAY[1, 2, 3]::integer[],  -- ID ингредиентов
    'ru',                        -- Язык
    20,                         -- Лимит
    0,                          -- Смещение
    'курица',                   -- Поисковый запрос
    'rating_desc'               -- Сортировка
);
*/

-- Поиск рецептов с частичным совпадением ингредиентов
/*
SELECT * FROM get_recipes_with_partial_ingredient_match(
    ARRAY[1, 2, 3, 4, 5]::integer[],  -- ID ингредиентов
    'ru',                              -- Язык
    60,                                -- Минимальный процент совпадений
    20,                                -- Лимит  
    0,                                 -- Смещение
    'салат',                           -- Поисковый запрос
    'match_desc'                       -- Сортировка по проценту совпадений
);
*/

-- Расширенный поиск с множественными фильтрами
/*
SELECT * FROM search_recipes_advanced(
    'ru',                              -- Язык
    'мясо',                           -- Поисковый запрос
    ARRAY[1, 2, 3]::integer[],        -- ID ингредиентов
    ARRAY[1]::integer[],              -- ID диет
    ARRAY[2]::integer[],              -- ID типов блюд
    ARRAY[3]::integer[],              -- ID кухонь
    4.0,                              -- Минимальный рейтинг
    60,                               -- Максимальное время приготовления (минуты)
    'medium',                         -- Сложность
    'rating_desc',                    -- Сортировка
    25,                               -- Лимит
    0                                 -- Смещение
);
*/

