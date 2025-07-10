import { db } from '@/storage/db';
import {
  ingredients,
  ingredientCategories,
  ingredientCategoryTranslations,
  ingredientCategoryLinks,
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
        and(
          eq(
            ingredientCategoryTranslations.categoryId,
            ingredientCategories.id
          ),
          eq(ingredientCategoryTranslations.language, language)
        )
      );

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
        categoryLink: ingredientCategoryLinks,
        category: ingredientCategories,
        categoryTranslation: ingredientCategoryTranslations,
      })
      .from(ingredients)
      .innerJoin(
        ingredientCategoryLinks,
        eq(ingredientCategoryLinks.ingredientId, ingredients.id)
      )
      .innerJoin(
        ingredientCategories,
        eq(ingredientCategories.id, ingredientCategoryLinks.categoryId)
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

    return rows.map(({ ingredient, category, categoryTranslation }) => ({
      ...ingredient,
      name: ingredient.name,
      category: {
        id: category.id,
        name: categoryTranslation?.name ?? 'Unknown',
        icon: category.icon ?? null,
      },
    }));
  },

  async searchIngredients(
    query: string,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const rows = await db
      .select()
      .from(ingredients)
      .where(
        and(
          eq(ingredients.language, language), // если есть такое поле
          ilike(ingredients.name, `%${query}%`),
          eq(ingredients.isActive, true)
        )
      );

    return rows.map((ingredient) => ({
      ...ingredient,
      name: ingredient.name,
    }));
  },

  async getIngredientsByCategory(
    categoryId: number,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const rows = await db
      .select({
        ingredient: ingredients,
        // translation: ingredientTranslations, // Remove if not used
        categoryLink: ingredientCategoryLinks,
      })
      .from(ingredients)
      .innerJoin(
        ingredientCategoryLinks,
        eq(ingredientCategoryLinks.ingredientId, ingredients.id)
      )
      .where(eq(ingredientCategoryLinks.categoryId, categoryId));

    return rows.map(({ ingredient }) => ({
      ...ingredient,
      name: ingredient.name, // Use the correct field for name
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
      name: category.name, // If category.name is not available, use 'Unknown'
      ingredients: allIngredients.filter(
        (ing) => ing.category && ing.category.id === category.id
      ),
    }));
  },

  async getFullIngredientTree(language: string): Promise<GroupedIngredients> {
    const rows = await db
      .select({
        ingredient: ingredients,
        categoryLink: ingredientCategoryLinks,
        category: ingredientCategories,
        categoryTranslation: ingredientCategoryTranslations,
      })
      .from(ingredients)
      .innerJoin(
        ingredientCategoryLinks,
        eq(ingredientCategoryLinks.ingredientId, ingredients.id)
      )
      .innerJoin(
        ingredientCategories,
        eq(ingredientCategories.id, ingredientCategoryLinks.categoryId)
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
      )
      .where(eq(ingredients.language, language));

    // Группируем по категориям
    const grouped = new Map();

    for (const { ingredient, category, categoryTranslation } of rows) {
      const catId = category.id;
      if (!grouped.has(catId)) {
        grouped.set(catId, {
          id: catId,
          name: categoryTranslation?.name ?? category.icon,
          icon: category.icon,
          ingredients: [],
        });
      }
      grouped.get(catId).ingredients.push({
        id: ingredient.id,
        name: ingredient.name,
        isActive: ingredient.isActive,
        // другие поля по необходимости
      });
    }

    return Array.from(grouped.values());
  },
};
