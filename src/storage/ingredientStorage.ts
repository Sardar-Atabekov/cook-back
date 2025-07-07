import { db } from '@/storage/db';
import {
  ingredients,
  ingredientCategories,
  ingredientCategoryTranslations,
  ingredientTranslations,
} from '@/models';
import { eq, and, ilike, sql } from 'drizzle-orm';

import type { InferSelectModel } from 'drizzle-orm';

export type IngredientCategory = InferSelectModel<typeof ingredientCategories>;
export type Ingredient = InferSelectModel<typeof ingredients>;

export type TranslatedIngredientCategory = IngredientCategory & {
  name: string;
  description?: string | null;
  icon?: string | null;
};

export type TranslatedIngredient = Ingredient & {
  name: string;
};

export type IngredientWithTranslatedCategory = TranslatedIngredient & {
  category: Pick<TranslatedIngredientCategory, 'id' | 'name' | 'icon'>;
};

export type GroupedIngredients = {
  id: number;
  name: string;
  ingredients: TranslatedIngredient[];
}[];

// Основной объект с методами
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
      .innerJoin(
        ingredientCategoryTranslations,
        sql`${ingredientCategoryTranslations.categoryId} = ${ingredientCategories.id} AND ${ingredientCategoryTranslations.language} = ${language}`
      );

    if (!rows.length) {
      console.warn(`No translations found for language: ${language}`);
    }
    return rows.map(({ category, translation }) => ({
      ...category,
      name: translation.name,
      description: translation.description ?? null,
      icon: category.icon ?? null,
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

    return rows.map(
      ({
        ingredient,
        ingredientTranslation,
        category,
        categoryTranslation,
      }) => ({
        ...ingredient,
        name: ingredientTranslation?.name ?? ingredient.primaryName,
        category: {
          id: category?.id ?? -1,
          name: categoryTranslation?.name ?? 'Unknown',
          icon: category?.icon ?? null,
        },
      })
    );
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

    return rows.map(({ ingredient, translation }) => ({
      ...ingredient,
      name: translation?.name ?? 'Unknown',
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

    return rows.map(({ ingredient, translation }) => ({
      ...ingredient,
      name: translation?.name ?? 'Unknown11',
    }));
  },

  async getGroupedIngredientsByCategory(
    language: string
  ): Promise<GroupedIngredients> {
    // Получаем категории и ингредиенты отдельно
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
