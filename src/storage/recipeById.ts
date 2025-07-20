import {
  recipes,
  recipeIngredients,
  ingredients,
  type Recipe,
  type RecipeWithIngredientsAndTags,
  type RecipeIngredient,
  type SavedRecipe,
  diets,
  kitchens,
  mealTypes,
  recipeDiets,
  recipeKitchens,
  recipeMealTypes,
} from '@/models';
import { db } from './db';
import {
  eq,
  inArray,
  sql,
  and,
  exists,
  SQL,
  count,
  desc,
  asc,
  getTableColumns,
  ilike,
} from 'drizzle-orm';
import { cache } from './redis';

// =================================================================
// Типы данных для "быстрых" ответов
// =================================================================
// "Быстрый" ответ содержит все поля из таблицы Recipe + данные по ингредиентам
type FastRecipeResponse = Recipe & {
  matchedCount: number;
  totalCount: number;
  matchPercentage: number;
};

// =================================================================
// Вспомогательные функции (Helpers)
// =================================================================

// Batch-функция для получения ингредиентов по списку recipeIds
async function getIngredientsForRecipeIds(recipeIds: number[]) {
  if (!recipeIds.length) return new Map();
  const rows = await db
    .select()
    .from(recipeIngredients)
    .where(inArray(recipeIngredients.recipeId, recipeIds));
  const map = new Map<number, any[]>();
  for (const row of rows) {
    if (!map.has(row.recipeId)) map.set(row.recipeId, []);
    map.get(row.recipeId)!.push(row);
  }
  return map;
}

// Batch-функция для получения тегов по списку recipeIds
// Оптимизировано: связи (id тегов) берём из БД, а сами теги — из кэша (tagStorage.getAllTags)
async function getTagsForRecipeIds(recipeIds: number[]) {
  if (!recipeIds.length) {
    return { mealTypes: new Map(), diets: new Map(), kitchens: new Map() };
  }

  // Получаем связи (id тегов) из БД
  const [mealTypeLinks, dietLinks, kitchenLinks] = await Promise.all([
    db
      .select({
        recipeId: recipeMealTypes.recipeId,
        tagId: recipeMealTypes.mealTypeId,
      })
      .from(recipeMealTypes)
      .where(inArray(recipeMealTypes.recipeId, recipeIds)),
    db
      .select({ recipeId: recipeDiets.recipeId, tagId: recipeDiets.dietId })
      .from(recipeDiets)
      .where(inArray(recipeDiets.recipeId, recipeIds)),
    db
      .select({
        recipeId: recipeKitchens.recipeId,
        tagId: recipeKitchens.kitchenId,
      })
      .from(recipeKitchens)
      .where(inArray(recipeKitchens.recipeId, recipeIds)),
  ]);

  // Получаем кэш тегов
  const allTags = await tagStorage.getAllTags();

  // Фильтруем только валидные связи (оба поля — числа)
  const validMealTypeLinks: { recipeId: number; tagId: number }[] =
    mealTypeLinks.filter(
      (l): l is { recipeId: number; tagId: number } =>
        typeof l.recipeId === 'number' && typeof l.tagId === 'number'
    );
  const validDietLinks: { recipeId: number; tagId: number }[] =
    dietLinks.filter(
      (l): l is { recipeId: number; tagId: number } =>
        typeof l.recipeId === 'number' && typeof l.tagId === 'number'
    );
  const validKitchenLinks: { recipeId: number; tagId: number }[] =
    kitchenLinks.filter(
      (l): l is { recipeId: number; tagId: number } =>
        typeof l.recipeId === 'number' && typeof l.tagId === 'number'
    );

  // Универсальный доступ к массивам тегов
  let mealTypesArr: any[] = [];
  let dietsArr: any[] = [];
  let kitchensArr: any[] = [];
  if (
    Array.isArray(allTags.mealTypes) &&
    Array.isArray(allTags.diets) &&
    Array.isArray(allTags.kitchens)
  ) {
    mealTypesArr = allTags.mealTypes;
    dietsArr = allTags.diets;
    kitchensArr = allTags.kitchens;
  } else if (Array.isArray(allTags.tags)) {
    mealTypesArr = allTags.tags.filter((t: any) => t.type === 'meal_type');
    dietsArr = allTags.tags.filter((t: any) => t.type === 'diet');
    kitchensArr = allTags.tags.filter((t: any) => t.type === 'kitchen');
  }

  function mapTags(
    links: { recipeId: number; tagId: number }[],
    tagArr: any[]
  ) {
    if (!Array.isArray(tagArr) || tagArr.length === 0) return new Map();
    const map = new Map<number, any[]>();
    for (const { recipeId, tagId } of links) {
      if (!map.has(recipeId)) map.set(recipeId, []);
      const tag = tagArr.find((t) => t.id === tagId);
      if (tag) map.get(recipeId)!.push(tag);
    }
    return map;
  }

  return {
    mealTypes: mapTags(validMealTypeLinks, mealTypesArr),
    diets: mapTags(validDietLinks, dietsArr),
    kitchens: mapTags(validKitchenLinks, kitchensArr),
  };
}

// =================================================================
// Основной объект recipeStorage
// =================================================================

export const recipeByIdStorage = {
  /**
   * @description Получает ПОЛНУЮ информацию для ОДНОГО рецепта и атомарно увеличивает счетчик просмотров.
   */
  async getRecipeById(
    id: number
  ): Promise<RecipeWithIngredientsAndTags | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    const [ingredientsMap, tags] = await Promise.all([
      getIngredientsForRecipeIds([id]),
      getTagsForRecipeIds([id]),
    ]);

    return {
      ...recipe,
      recipeIngredients: ingredientsMap.get(id) || [],
      mealTypes: tags.mealTypes.get(id) || [],
      diets: tags.diets.get(id) || [],
      kitchens: tags.kitchens.get(id) || [],
    };
  },
};

// Кэшированный метод для получения всех тегов (mealTypes, diets, kitchens)
export const tagStorage = {
  async getAllTags() {
    const cacheKey = 'tags:all';
    const cached = await cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Получаем все mealTypes, diets, kitchens из БД
    const [allMealTypes, allDiets, allKitchens] = await Promise.all([
      db.select().from(mealTypes),
      db.select().from(diets),
      db.select().from(kitchens),
    ]);
    const tags = {
      mealTypes: allMealTypes,
      diets: allDiets,
      kitchens: allKitchens,
    };
    await cache.setex(cacheKey, 604800, JSON.stringify(tags));
    return tags;
  },
};
