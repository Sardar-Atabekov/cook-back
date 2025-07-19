import {
  recipes,
  recipeIngredients,
  ingredients,
  savedRecipes,
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
    .select({
      recipeId: recipeIngredients.recipeId,
      ingredient: ingredients,
      recipeIngredient: recipeIngredients,
    })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
    .where(inArray(recipeIngredients.recipeId, recipeIds));
  const map = new Map<number, any[]>();
  for (const row of rows) {
    if (!map.has(row.recipeId)) map.set(row.recipeId, []);
    const recipeIngredients = map.get(row.recipeId);
    if (recipeIngredients) {
      recipeIngredients.push({ ...row.ingredient, ...row.recipeIngredient });
    }
  }
  return map;
}

// Batch-функция для получения тегов по списку recipeIds
async function getTagsForRecipeIds(recipeIds: number[]) {
  if (!recipeIds.length)
    return { mealTypes: new Map(), diets: new Map(), kitchens: new Map() };
  // mealTypes
  const mealTypeRows = await db
    .select({
      recipeId: recipeMealTypes.recipeId,
      tagId: recipeMealTypes.mealTypeId,
      tag: mealTypes,
    })
    .from(recipeMealTypes)
    .innerJoin(mealTypes, eq(recipeMealTypes.mealTypeId, mealTypes.id))
    .where(inArray(recipeMealTypes.recipeId, recipeIds));
  const mealTypesMap = new Map<number, any[]>();
  for (const row of mealTypeRows) {
    if (row.recipeId === null) continue;
    if (!mealTypesMap.has(row.recipeId)) mealTypesMap.set(row.recipeId, []);
    const mealTypes = mealTypesMap.get(row.recipeId);
    if (mealTypes) {
      mealTypes.push(row.tag);
    }
  }
  // diets
  const dietRows = await db
    .select({
      recipeId: recipeDiets.recipeId,
      tagId: recipeDiets.dietId,
      tag: diets,
    })
    .from(recipeDiets)
    .innerJoin(diets, eq(recipeDiets.dietId, diets.id))
    .where(inArray(recipeDiets.recipeId, recipeIds));
  const dietsMap = new Map<number, any[]>();
  for (const row of dietRows) {
    if (row.recipeId === null) continue;
    if (!dietsMap.has(row.recipeId)) dietsMap.set(row.recipeId, []);
    const diets = dietsMap.get(row.recipeId);
    if (diets) {
      diets.push(row.tag);
    }
  }
  // kitchens
  const kitchenRows = await db
    .select({
      recipeId: recipeKitchens.recipeId,
      tagId: recipeKitchens.kitchenId,
      tag: kitchens,
    })
    .from(recipeKitchens)
    .innerJoin(kitchens, eq(recipeKitchens.kitchenId, kitchens.id))
    .where(inArray(recipeKitchens.recipeId, recipeIds));
  const kitchensMap = new Map<number, any[]>();
  for (const row of kitchenRows) {
    if (row.recipeId === null) continue;
    if (!kitchensMap.has(row.recipeId)) kitchensMap.set(row.recipeId, []);
    const kitchens = kitchensMap.get(row.recipeId);
    if (kitchens) {
      kitchens.push(row.tag);
    }
  }
  return { mealTypes: mealTypesMap, diets: dietsMap, kitchens: kitchensMap };
}

// =================================================================
// Основной объект recipeStorage
// =================================================================

export const recipeByIdStorage = {
  /**
   * @description Получает ПОЛНУЮ информацию для ОДНОГО рецепта и атомарно увеличивает счетчик просмотров.
   */
  async getRecipeById(
    id: number,
    ingredientIds: number[] = []
  ): Promise<
    | (RecipeWithIngredientsAndTags & {
        matchPercentage: number;
        missingIngredients: RecipeIngredient[];
      })
    | undefined
  > {
    // Получаем рецепт
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    // Получаем ингредиенты и теги batch-запросами
    const [ingredientsMap, tags] = await Promise.all([
      getIngredientsForRecipeIds([id]),
      getTagsForRecipeIds([id]),
    ]);
    const recipeIngredients = ingredientsMap.get(id) || [];
    const validIngredients = recipeIngredients.filter(
      (ing) => ing.ingredientId != null
    );
    const matchedIngredients = validIngredients.filter((ing) =>
      ingredientIds.includes(ing.ingredientId)
    );
    const missingIngredients = validIngredients.filter(
      (ing) => !ingredientIds.includes(ing.ingredientId)
    );
    const matchPercentage =
      validIngredients.length > 0
        ? Math.round(
            (matchedIngredients.length / validIngredients.length) * 100
          )
        : 0;

    return {
      ...recipe,
      recipeIngredients,
      matchPercentage,
      missingIngredients,
      mealTypes: tags.mealTypes.get(id) || [],
      diets: tags.diets.get(id) || [],
      kitchens: tags.kitchens.get(id) || [],
    };
  },

  /**
   * @description Получает все теги для фильтрации
   */
  async getAllTags() {
    const [mealTypesData, dietsData, kitchensData] = await Promise.all([
      db.select().from(mealTypes),
      db.select().from(diets),
      db.select().from(kitchens),
    ]);

    return [
      ...mealTypesData.map((tag) => ({ ...tag, type: 'meal_type' as const })),
      ...dietsData.map((tag) => ({ ...tag, type: 'diet' as const })),
      ...kitchensData.map((tag) => ({ ...tag, type: 'kitchen' as const })),
    ];
  },
};

export { getIngredientsForRecipeIds, getTagsForRecipeIds };
