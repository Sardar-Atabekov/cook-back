import {
  recipes,
  recipeIngredients,
  ingredients,
  savedRecipes,
  type Recipe,
  type RecipeWithIngredients,
  type RecipeIngredient,
  type SavedRecipe,
} from '@/models';
import { db } from './db';
import { eq, inArray, sql, and } from 'drizzle-orm';

export const recipeStorage = {
  async getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number,
    lang: string
  ): Promise<RecipeWithIngredients[]> {
    if (ingredientIds.length === 0) {
      const recipesResult = await db
        .select()
        .from(recipes)
        .where(eq(recipes.lang, lang))
        .limit(limit)
        .offset(offset);

      const recipeIds = recipesResult.map((r) => r.id);
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

      return recipesResult.map((recipe) => ({
        ...recipe,
        recipeIngredients: recipeIngredientsResult
          .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
          .map((ri) => ({
            ...ri.recipeIngredient,
            ingredient: ri.ingredient,
          })),
      }));
    }

    const recipesResult = await db
      .select({
        recipe: recipes,
        matchCount: sql<number>`COUNT(DISTINCT ${recipeIngredients.ingredientId})`,
      })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          eq(recipes.lang, lang),
          inArray(recipeIngredients.ingredientId, ingredientIds)
        )
      )
      .groupBy(recipes.id)
      .orderBy(sql`COUNT(DISTINCT ${recipeIngredients.ingredientId}) DESC`)
      .limit(limit)
      .offset(offset);

    const recipeIds = recipesResult.map((r) => r.recipe.id);
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

    return recipesResult.map(({ recipe }) => ({
      ...recipe,
      recipeIngredients: recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ({
          ...ri.recipeIngredient,
          ingredient: ri.ingredient,
        })),
    }));
  },

  async getRecipeById(
    id: number,
    lang: string
  ): Promise<RecipeWithIngredients | undefined> {
    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.lang, lang)));

    if (!recipe) return undefined;

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

    return {
      ...recipe,
      recipeIngredients: recipeIngredientsResult.map((ri) => ({
        ...ri.recipeIngredient,
        ingredient: ri.ingredient,
      })),
    };
  },

  async searchRecipes(query: string, lang: string): Promise<Recipe[]> {
    return await db
      .select()
      .from(recipes)
      .where(
        and(sql`${recipes.title} ILIKE ${`%${query}%`}`, eq(recipes.lang, lang))
      );
  },

  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
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
        .map((ri) => ({
          ...ri.recipeIngredient,
          ingredient: ri.ingredient,
        })),
    }));
  },

  async countRecipes(ingredientIds: number[], lang: string): Promise<number> {
    if (ingredientIds.length === 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(recipes)
        .where(eq(recipes.lang, lang));

      return count;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${recipes.id})` })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(
        and(
          eq(recipes.lang, lang),
          inArray(recipeIngredients.ingredientId, ingredientIds)
        )
      );

    return count;
  },
};
