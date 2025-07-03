import { db } from '@/storage/db';
import {
  ingredients,
  ingredientCategories,
  type Ingredient as DbIngredient,
  type IngredientCategory as DbIngredientCategory,
} from '@/models';
import { eq, sql, or } from 'drizzle-orm';
import { TranslationUtils } from '../utils/translation';
import { InferSelectModel } from 'drizzle-orm';

// Определяем типы, которые будут использоваться в API
export type IngredientCategory = InferSelectModel<typeof ingredientCategories>;
export type Ingredient = InferSelectModel<typeof ingredients>;

export type TranslatedIngredientCategory = Omit<
  IngredientCategory,
  'names' | 'descriptions'
> & {
  name: string;
  description?: string;
};

export type TranslatedIngredient = Omit<Ingredient, 'names' | 'aliases'> & {
  name: string;
  aliases?: string[];
};

export type IngredientWithTranslatedCategory = TranslatedIngredient & {
  category: Pick<TranslatedIngredientCategory, 'id' | 'name'>;
};

export type GroupedIngredients = {
  id: string;
  name: string;
  ingredients: TranslatedIngredient[];
}[];

export const ingredientStorage = {
  async getIngredientCategories(
    language: string
  ): Promise<TranslatedIngredientCategory[]> {
    const categories = await db.select().from(ingredientCategories);
    return categories.map((cat) => ({
      id: cat.id,
      parentId: cat.parentId,
      level: cat.level,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      name: TranslationUtils.getTranslatedText(cat.names, language),
      description: cat.descriptions
        ? TranslationUtils.getTranslatedText(cat.descriptions, language)
        : undefined,
    }));
  },

  async getAllIngredients(
    language: string
  ): Promise<IngredientWithTranslatedCategory[]> {
    const rows = await db
      .select({
        ingredient: ingredients,
        category: ingredientCategories,
      })
      .from(ingredients)
      .leftJoin(
        ingredientCategories,
        eq(ingredients.categoryId, ingredientCategories.id)
      );

    return rows
      .filter((row) => row.category)
      .map((row) => ({
        id: row.ingredient.id,
        categoryId: row.ingredient.categoryId,
        primaryName: row.ingredient.primaryName,
        externalId: row.ingredient.externalId,
        isActive: row.ingredient.isActive,
        createdAt: row.ingredient.createdAt,
        updatedAt: row.ingredient.updatedAt,
        lastSyncAt: row.ingredient.lastSyncAt,
        name: TranslationUtils.getTranslatedText(
          row.ingredient.names,
          language
        ),
        aliases: row.ingredient.aliases
          ? (Object.values(row.ingredient.aliases).flat() as string[])
          : undefined,
        nutritionalData: row.ingredient.nutritionalData,
        category: {
          id: row.category!.id,
          name: TranslationUtils.getTranslatedText(
            row.category!.names,
            language
          ),
        },
      }));
  },

  async searchIngredients(
    query: string,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const searchConditions = TranslationUtils.createMultilingualSearchCondition(
      ingredients.names,
      query,
      [language, 'en'] // Ищем сначала на запрошенном языке, потом на английском
    );

    const searchAliasConditions =
      TranslationUtils.createMultilingualSearchCondition(
        ingredients.aliases,
        query,
        [language, 'en']
      );

    const result = await db
      .select()
      .from(ingredients)
      .where(or(searchConditions, searchAliasConditions));

    return result.map((ing) => ({
      id: ing.id,
      categoryId: ing.categoryId,
      primaryName: ing.primaryName,
      externalId: ing.externalId,
      isActive: ing.isActive,
      createdAt: ing.createdAt,
      updatedAt: ing.updatedAt,
      lastSyncAt: ing.lastSyncAt,
      name: TranslationUtils.getTranslatedText(ing.names, language),
      aliases: ing.aliases
        ? (Object.values(ing.aliases).flat() as string[])
        : undefined,
      nutritionalData: ing.nutritionalData,
    }));
  },

  async getIngredientsByCategory(
    categoryId: string,
    language: string
  ): Promise<TranslatedIngredient[]> {
    const result = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.categoryId, categoryId));

    return result.map((ing) => ({
      id: ing.id,
      categoryId: ing.categoryId,
      primaryName: ing.primaryName,
      externalId: ing.externalId,
      isActive: ing.isActive,
      createdAt: ing.createdAt,
      updatedAt: ing.updatedAt,
      lastSyncAt: ing.lastSyncAt,
      name: TranslationUtils.getTranslatedText(ing.names, language),
      aliases: ing.aliases
        ? (Object.values(ing.aliases).flat() as string[])
        : undefined,
      nutritionalData: ing.nutritionalData,
    }));
  },

  async getGroupedIngredientsByCategory(
    language: string
  ): Promise<GroupedIngredients[]> {
    const categories = await db.select().from(ingredientCategories);
    const allIngredients = await db.select().from(ingredients);

    const grouped = categories.map((category) => ({
      id: category.id,
      name: TranslationUtils.getTranslatedText(category.names as any, language),
      ingredients: allIngredients
        .filter((ing) => ing.categoryId === category.id)
        .map((ing) => ({
          id: ing.id,
          categoryId: ing.categoryId,
          primaryName: ing.primaryName,
          externalId: ing.externalId,
          isActive: ing.isActive,
          createdAt: ing.createdAt,
          updatedAt: ing.updatedAt,
          lastSyncAt: ing.lastSyncAt,
          name: TranslationUtils.getTranslatedText(ing.names, language),
          aliases: ing.aliases
            ? (Object.values(ing.aliases).flat() as string[])
            : undefined,
          nutritionalData: ing.nutritionalData,
        })),
    }));

    return grouped;
  },
};
