import { db } from '@/storage/db';
import {
  ingredients,
  ingredientCategories,
  type Ingredient,
  type IngredientCategory,
} from '@/models/schema';
import { eq, sql } from 'drizzle-orm';

export const ingredientStorage = {
  async getIngredientCategories(): Promise<IngredientCategory[]> {
    return await db.select().from(ingredientCategories);
  },

  async getIngredientsByCategory(categoryId: number): Promise<Ingredient[]> {
    return await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.categoryId, categoryId));
  },

  async getAllIngredients(): Promise<
    (Ingredient & { category: Pick<IngredientCategory, 'id' | 'name'> })[]
  > {
    const rows = await db
      .select()
      .from(ingredients)
      .leftJoin(
        ingredientCategories,
        eq(ingredients.categoryId, ingredientCategories.id)
      );

    return rows
      .filter((row) => row.ingredient_categories)
      .map((row) => ({
        ...row.ingredients,
        categoryId: row.ingredients.categoryId,
        categoryName: row.ingredient_categories!.name,
        category: {
          id: row.ingredient_categories!.id,
          name: row.ingredient_categories!.name,
        },
      }));
  },

  async searchIngredients(query: string): Promise<Ingredient[]> {
    return await db
      .select()
      .from(ingredients)
      .where(sql`${ingredients.name} ILIKE ${`%${query}%`}`);
  },
};
