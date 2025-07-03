import { db } from '@/storage/db';
import {
  ingredients,
  ingredientCategories,
  ingredientCategoryTranslations,
  ingredientTranslations,
} from '@/models';
import { eq, and, ilike, sql } from 'drizzle-orm';

// Типы
import { InferSelectModel } from 'drizzle-orm';

export type IngredientCategory = InferSelectModel<typeof ingredientCategories>;
export type Ingredient = InferSelectModel<typeof ingredients>;

export type TranslatedIngredientCategory = IngredientCategory & {
  name: string;
  description?: string;
};

export type TranslatedIngredient = Ingredient & {
  name: string;
};

export type IngredientWithTranslatedCategory = TranslatedIngredient & {
  category: Pick<TranslatedIngredientCategory, 'id' | 'name'>;
};

export type GroupedIngredients = {
  id: number;
  name: string;
  ingredients: TranslatedIngredient[];
}[];

export const ingredientStorage = {
  async getIngredientCategories(
    language: string
  ): Promise<TranslatedIngredientCategory[]> {
    const rows = await db
      .select({
        category: ingredientCategories,
        translation: ingredientCategoryTranslations,
      })
      .from(ingredientCategories)
      .leftJoin(
        ingredientCategoryTranslations,
        and(
          eq(
            ingredientCategoryTranslations.categoryId,
            ingredientCategories.id
          ),
          eq(ingredientCategoryTranslations.language, language)
        )
      );

    return rows.map((row) => ({
      ...row.category,
      name: row.translation?.name ?? 'Unknown',
      description: row.translation?.description ?? undefined,
    }));
  },

  async getAllIngredients(
    language: string
  ): Promise<IngredientWithTranslatedCategory[]> {
    const rows = await db
      .select({
        ingredient: ingredients,
        ingredientTranslation: ingredientTranslations,
        category: ingredientCategories,
        categoryTranslation: ingredientCategoryTranslations,
      })
      .from(ingredients)
      .leftJoin(
        ingredientTranslations,
        and(
          eq(ingredientTranslations.ingredientId, ingredients.id),
          eq(ingredientTranslations.language, language)
        )
      )
      .leftJoin(
        ingredientCategories,
        eq(ingredients.categoryId, ingredientCategories.id)
      )
      .leftJoin(
        ingredientCategoryTranslations,
        and(
          eq(
            ingredientCategoryTranslations.categoryId,
            ingredientCategories.id
          ),
          eq(ingredientCategoryTranslations.language, language)
        )
      );

    return rows.map((row) => ({
      ...row.ingredient,
      name: row.ingredientTranslation?.name ?? 'Unknown',
      category: {
        id: row.category?.id ?? -1,
        name: row.categoryTranslation?.name ?? 'Unknown',
      },
    }));
  },

  async searchIngredients(
    query: string,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const rows = await db
      .select({
        ingredient: ingredients,
        translation: ingredientTranslations,
      })
      .from(ingredients)
      .leftJoin(
        ingredientTranslations,
        and(
          eq(ingredientTranslations.ingredientId, ingredients.id),
          eq(ingredientTranslations.language, language)
        )
      )
      .where(ilike(ingredientTranslations.name, `%${query}%`));

    return rows.map((row) => ({
      ...row.ingredient,
      name: row.translation?.name ?? 'Unknown',
    }));
  },

  async getIngredientsByCategory(
    categoryId: number,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const rows = await db
      .select({
        ingredient: ingredients,
        translation: ingredientTranslations,
      })
      .from(ingredients)
      .leftJoin(
        ingredientTranslations,
        and(
          eq(ingredientTranslations.ingredientId, ingredients.id),
          eq(ingredientTranslations.language, language)
        )
      )
      .where(eq(ingredients.categoryId, categoryId));

    return rows.map((row) => ({
      ...row.ingredient,
      name: row.translation?.name ?? 'Unknown',
    }));
  },

  async getGroupedIngredientsByCategory(
    language: string
  ): Promise<GroupedIngredients> {
    const categories =
      await ingredientStorage.getIngredientCategories(language);
    const allIngredients = await ingredientStorage.getAllIngredients(language);

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      ingredients: allIngredients.filter(
        (ing) => ing.categoryId === category.id
      ),
    }));
  },
};
