import {
  recipes,
  recipeIngredients,
  ingredients,
  savedRecipes,
  type Recipe,
  type RecipeWithIngredients,
  type RecipeWithIngredientsAndTags,
  type RecipeIngredient,
  type SavedRecipe,
} from '@/models';
import { db } from './db';
import { eq, inArray, sql, and, exists } from 'drizzle-orm';
import {
  diets,
  kitchens,
  mealTypes,
  recipeDiets,
  recipeKitchens,
  recipeMealTypes,
} from '@/models/schema/tags';

type Tag = {
  id: number;
  tag: string;
  name: string;
  slug: string;
  type: 'meal_type' | 'diet' | 'kitchen';
};

export const recipeStorage = {
  async getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number,
    lang: string,
    dietTagIds: number[],
    mealTypeIds: number[],
    kitchenIds: number[]
  ): Promise<
    (RecipeWithIngredientsAndTags & {
      matchPercentage: number;
      missingIngredients: RecipeIngredient[];
    })[]
  > {
    console.log('dietTagIds', dietTagIds);
    console.log('mealTypeIds', mealTypeIds);
    console.log('kitchenIds', kitchenIds);
    console.log('ingredientIds', ingredientIds);
    const getIngredientsForRecipes = async (recipeIds: number[]) => {
      if (recipeIds.length === 0) return [];

      return await db
        .select({
          recipeIngredient: recipeIngredients,
          ingredient: ingredients,
        })
        .from(recipeIngredients)
        .innerJoin(
          ingredients,
          eq(recipeIngredients.ingredientId, ingredients.id)
        )
        .where(inArray(recipeIngredients.recipeId, recipeIds));
    };

    // Функция для применения фильтров
    const buildFilterConditions = () => {
      const conditions = [eq(recipes.lang, lang)];

      // Фильтры по тегам через ID
      if (dietTagIds && dietTagIds.length > 0) {
        conditions.push(
          exists(
            db
              .select()
              .from(recipeDiets)
              .where(
                and(
                  eq(recipeDiets.recipeId, recipes.id),
                  inArray(recipeDiets.dietId, dietTagIds)
                )
              )
          )
        );
      }

      if (mealTypeIds && mealTypeIds.length > 0) {
        conditions.push(
          exists(
            db
              .select()
              .from(recipeMealTypes)
              .where(
                and(
                  eq(recipeMealTypes.recipeId, recipes.id),
                  inArray(recipeMealTypes.mealTypeId, mealTypeIds)
                )
              )
          )
        );
      }

      if (kitchenIds && kitchenIds.length > 0) {
        conditions.push(
          exists(
            db
              .select()
              .from(recipeKitchens)
              .where(
                and(
                  eq(recipeKitchens.recipeId, recipes.id),
                  inArray(recipeKitchens.kitchenId, kitchenIds)
                )
              )
          )
        );
      }

      return conditions;
    };

    // Если ingredientIds пустой — просто верни рецепты с фильтрами
    if (ingredientIds.length === 0) {
      const filterConditions = buildFilterConditions();

      const recipesResult = await db
        .select()
        .from(recipes)
        .where(
          filterConditions.length > 0 ? and(...filterConditions) : undefined
        )
        .limit(limit)
        .offset(offset);

      const recipeIds = recipesResult.map((r) => r.id);
      const recipeIngredientsResult = await getIngredientsForRecipes(recipeIds);

      const { mealTypes, diets, kitchens } =
        await getTagsForRecipeIds(recipeIds);

      return recipesResult.map((recipe) => {
        const recipeIngr = recipeIngredientsResult
          .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
          .map((ri) => ri.recipeIngredient);

        return {
          ...recipe,
          recipeIngredients: recipeIngr,
          matchPercentage: 0,
          missingIngredients: [],
          mealTypes: mealTypes.get(recipe.id) || [],
          diets: diets.get(recipe.id) || [],
          kitchens: kitchens.get(recipe.id) || [],
        };
      });
    }

    // Получаем рецепты, которые содержат нужные ингредиенты И соответствуют фильтрам
    const filterConditions = buildFilterConditions();

    const recipesWithIngredients = await db
      .select({
        recipe: recipes,
      })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          ...(filterConditions.length > 0 ? filterConditions : []),
          inArray(recipeIngredients.ingredientId, ingredientIds)
        )
      );

    const recipeMap = new Map<
      number,
      (typeof recipesWithIngredients)[0]['recipe']
    >();
    recipesWithIngredients.forEach((r) => {
      recipeMap.set(r.recipe.id, r.recipe);
    });

    const recipesResult = Array.from(recipeMap.values());
    const recipeIds = recipesResult.map((r) => r.id);
    const recipeIngredientsResult = await getIngredientsForRecipes(recipeIds);

    const { mealTypes, diets, kitchens } = await getTagsForRecipeIds(recipeIds);

    const fullResult = recipesResult.map((recipe) => {
      const recipeIngr = recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ri.recipeIngredient);

      // Только те, у кого есть ingredientId
      const validRecipeIngredients = recipeIngr.filter(
        (ri) => typeof ri.ingredientId === 'number' && !isNaN(ri.ingredientId)
      );

      const matched = validRecipeIngredients.filter((ri) =>
        ingredientIds.includes(Number(ri.ingredientId))
      );

      const missing = validRecipeIngredients.filter(
        (ri) => !ingredientIds.includes(Number(ri.ingredientId))
      );

      const matchPercentage =
        validRecipeIngredients.length > 0
          ? Math.round((matched.length / validRecipeIngredients.length) * 100)
          : 0;

      return {
        ...recipe,
        recipeIngredients: recipeIngr,
        matchPercentage,
        missingIngredients: missing,
        mealTypes: mealTypes.get(recipe.id) || [],
        diets: diets.get(recipe.id) || [],
        kitchens: kitchens.get(recipe.id) || [],
      };
    });

    // Сортируем по matchPercentage DESC и возвращаем с учетом limit/offset
    return fullResult
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(offset, offset + limit);
  },

  async getRecipeById(
    id: number,
    ingredientIds: number[]
  ): Promise<
    | (RecipeWithIngredientsAndTags & {
        matchPercentage: number;
        missingIngredients: RecipeIngredient[];
      })
    | undefined
  > {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));

    if (!recipe) return undefined;

    // Получаем сам рецепт
    const {
      mealTypes: tagMapMealTypes,
      diets: tagMapDiets,
      kitchens: tagMapKitchens,
    } = await getTagsForRecipeIds([recipe.id]);

    // Получаем ингредиенты этого рецепта
    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(eq(recipeIngredients.recipeId, id));

    const recipeIngr = recipeIngredientsResult.map((ri) => ri.recipeIngredient);

    // Только валидные ingredientId
    const validRecipeIngredients = recipeIngr.filter(
      (ri) => typeof ri.ingredientId === 'number' && !isNaN(ri.ingredientId)
    );

    const matched = validRecipeIngredients.filter((ri) =>
      ingredientIds.includes(Number(ri.ingredientId))
    );

    const missing = validRecipeIngredients.filter(
      (ri) => !ingredientIds.includes(Number(ri.ingredientId))
    );

    const matchPercentage =
      validRecipeIngredients.length > 0
        ? Math.round((matched.length / validRecipeIngredients.length) * 100)
        : 0;

    return {
      ...recipe,
      recipeIngredients: recipeIngr,
      matchPercentage,
      missingIngredients: missing,
      mealTypes: tagMapMealTypes.get(recipe.id) || [],
      diets: tagMapDiets.get(recipe.id) || [],
      kitchens: tagMapKitchens.get(recipe.id) || [],
    };
  },

  async searchRecipes(
    query: string,
    lang: string,
    ingredientIds: number[],
    limit: number,
    offset: number,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<Recipe[]> {
    // Условия для фильтрации
    const conditions = [
      sql`${recipes.title} ILIKE ${`%${query}%`}`,
      eq(recipes.lang, lang),
    ];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    return await db
      .select()
      .from(recipes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset);
  },

  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
  },

  async getAllTags(): Promise<Tag[]> {
    const [mealTypesRaw, dietsRaw, kitchensRaw] = await Promise.all([
      db
        .select({
          id: mealTypes.id,
          tag: mealTypes.tag,
          name: mealTypes.name,
          slug: mealTypes.slug,
        })
        .from(mealTypes),
      db
        .select({
          id: diets.id,
          tag: diets.tag,
          name: diets.name,
          slug: diets.slug,
        })
        .from(diets),
      db
        .select({
          id: kitchens.id,
          tag: kitchens.tag,
          name: kitchens.name,
          slug: kitchens.slug,
        })
        .from(kitchens),
    ]);

    return [
      ...mealTypesRaw.map((t) => ({ ...t, type: 'meal_type' as const })),
      ...dietsRaw.map((t) => ({ ...t, type: 'diet' as const })),
      ...kitchensRaw.map((t) => ({ ...t, type: 'kitchen' as const })),
    ];
  },

  async unsaveRecipe(userId: number, recipeId: number): Promise<void> {
    await db
      .delete(savedRecipes)
      .where(
        and(
          eq(savedRecipes.userId, userId),
          eq(savedRecipes.recipeId, recipeId)
        )
      );
  },

  async getUserSavedRecipes(
    userId: number,
    lang: string
  ): Promise<RecipeWithIngredients[]> {
    const savedRecipesResult = await db
      .select({ recipe: recipes })
      .from(savedRecipes)
      .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
      .where(and(eq(savedRecipes.userId, userId), eq(recipes.lang, lang)));

    const recipeIds = savedRecipesResult.map((sr) => sr.recipe.id);
    if (recipeIds.length === 0) return [];

    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(inArray(recipeIngredients.recipeId, recipeIds));

    return savedRecipesResult.map(({ recipe }) => ({
      ...recipe,
      recipeIngredients: recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ri.recipeIngredient),
    }));
  },

  async countRecipes(
    ingredientIds: number[],
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const conditions = [eq(recipes.lang, lang)];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    if (ingredientIds.length === 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(recipes)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return count;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          ...(conditions.length > 0 ? conditions : []),
          inArray(recipeIngredients.ingredientId, ingredientIds)
        )
      );

    return count;
  },

  // Новый метод для подсчета результатов поиска
  async countSearchResults(
    query: string,
    lang: string,
    dietTagIds?: number[],
    mealTypeIds?: number[],
    kitchenIds?: number[]
  ): Promise<number> {
    const conditions = [
      sql`${recipes.title} ILIKE ${`%${query}%`}`,
      eq(recipes.lang, lang),
    ];

    // Фильтры по тегам через ID
    if (dietTagIds && dietTagIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeDiets)
            .where(
              and(
                eq(recipeDiets.recipeId, recipes.id),
                inArray(recipeDiets.dietId, dietTagIds)
              )
            )
        )
      );
    }

    if (mealTypeIds && mealTypeIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeMealTypes)
            .where(
              and(
                eq(recipeMealTypes.recipeId, recipes.id),
                inArray(recipeMealTypes.mealTypeId, mealTypeIds)
              )
            )
        )
      );
    }

    if (kitchenIds && kitchenIds.length > 0) {
      conditions.push(
        exists(
          db
            .select()
            .from(recipeKitchens)
            .where(
              and(
                eq(recipeKitchens.recipeId, recipes.id),
                inArray(recipeKitchens.kitchenId, kitchenIds)
              )
            )
        )
      );
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(recipes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return count;
  },
};

async function getTagsForRecipeIds(recipeIds: number[]) {
  const mealTypesRaw = await db
    .select({
      recipeId: recipeMealTypes.recipeId,
      tag: mealTypes.tag,
      name: mealTypes.name,
      slug: mealTypes.slug,
    })
    .from(recipeMealTypes)
    .innerJoin(mealTypes, eq(recipeMealTypes.mealTypeId, mealTypes.id))
    .where(inArray(recipeMealTypes.recipeId, recipeIds));

  const dietsRaw = await db
    .select({
      recipeId: recipeDiets.recipeId,
      tag: diets.tag,
      name: diets.name,
      slug: diets.slug,
    })
    .from(recipeDiets)
    .innerJoin(diets, eq(recipeDiets.dietId, diets.id))
    .where(inArray(recipeDiets.recipeId, recipeIds));

  const kitchensRaw = await db
    .select({
      recipeId: recipeKitchens.recipeId,
      tag: kitchens.tag,
      name: kitchens.name,
      slug: kitchens.slug,
    })
    .from(recipeKitchens)
    .innerJoin(kitchens, eq(recipeKitchens.kitchenId, kitchens.id))
    .where(inArray(recipeKitchens.recipeId, recipeIds));

  const groupByRecipe = (rows: any[]) => {
    const map = new Map<number, any[]>();
    for (const row of rows) {
      if (!map.has(row.recipeId)) map.set(row.recipeId, []);
      map.get(row.recipeId)!.push({
        tag: row.tag,
        name: row.name,
        slug: row.slug,
      });
    }
    return map;
  };

  return {
    mealTypes: groupByRecipe(mealTypesRaw),
    diets: groupByRecipe(dietsRaw),
    kitchens: groupByRecipe(kitchensRaw),
  };
}
