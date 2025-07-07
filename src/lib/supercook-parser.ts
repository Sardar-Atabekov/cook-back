import { db } from '@/storage/db';
import {
  ingredientCategories,
  ingredients,
  ingredientCategoryTranslations,
  ingredientTranslations,
} from '@/models';
import { eq } from 'drizzle-orm';
import axios from 'axios';

/** Получаем массив категорий с API */
async function fetchSupercookData(language = 'ru') {
  const url = 'https://d1.supercook.com/dyn/lang_ings';
  const payload = new URLSearchParams({ lang: language, cv: '2' }).toString();
  const response = await axios.post(url, payload, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  // The API returns an array directly, not an object with a 'data' key
  const data = Array.isArray(response.data) ? response.data : response.data;
  return data;
}

export async function syncSupercookIngredients(language: string | undefined) {
  if (!language) return;
  const apiData = await fetchSupercookData(language);

  await db.transaction(async (tx) => {
    // 1) Insert categories if not exist and get their IDs
    const categoryIds = new Map();
    for (const item of apiData) {
      const name = item.group_name.trim();
      const icon = item.icon; // Get icon from the API response
      let categoryId;

      // First, try to find the category by its translation name for the given language
      const existingTranslation = await tx
        .select()
        .from(ingredientCategoryTranslations)
        .where(eq(ingredientCategoryTranslations.name, name))
        .limit(1);

      if (existingTranslation.length > 0) {
        categoryId = existingTranslation[0].categoryId;
      } else {
        // If no translation exists, insert a new category
        const insertedCategory = await tx
          .insert(ingredientCategories)
          .values({
            parentId: null,
            level: 0,
            sortOrder: 0,
            isActive: true,
            icon: icon, // Include icon when inserting new category
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning({ id: ingredientCategories.id });
        categoryId = insertedCategory[0].id;

        // Insert the translation for the new category
        await tx
          .insert(ingredientCategoryTranslations)
          .values({ categoryId: categoryId, language, name, description: null })
          .onConflictDoUpdate({
            target: [
              ingredientCategoryTranslations.categoryId,
              ingredientCategoryTranslations.language,
            ],
            set: { name: name, description: null },
          });
      }
      categoryIds.set(name.toLowerCase(), categoryId);
    }

    // 2) Process ingredients
    for (const item of apiData) {
      const categoryName = item.group_name.trim();
      const catId = categoryIds.get(categoryName.toLowerCase());
      if (!catId) continue;
      console.log('item', item);
      for (const display of item.ingredients) {
        const term = display.trim();
        let ingredientId;

        // Try to find existing ingredient by primaryName
        const existingIngredient = await tx
          .select()
          .from(ingredients)
          .where(eq(ingredients.primaryName, term))
          .limit(1);

        if (existingIngredient.length > 0) {
          ingredientId = existingIngredient[0].id;
        } else {
          // Insert new ingredient record
          const insertedIngredient = await tx
            .insert(ingredients)
            .values({
              categoryId: catId,
              primaryName: term,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              lastSyncAt: new Date(),
            })
            .returning({ id: ingredients.id });
          ingredientId = insertedIngredient[0].id;
        }

        // Insert ingredient translation
        await tx
          .insert(ingredientTranslations)
          .values({ ingredientId: ingredientId, language, name: term })
          .onConflictDoUpdate({
            target: [
              ingredientTranslations.ingredientId,
              ingredientTranslations.language,
            ],
            set: { name: term },
          });
      }
    }
  });

  console.log('Синхронизация Supercook завершена');
}

// async function main() {
//   try {
//     // Use 'ru' for Russian language based on the provided example
//     await syncSupercookIngredients('ru');
//     console.log('Data import process finished.');
//   } catch (error) {
//     console.error('An error occurred during the data import process:', error);
//   } finally {
//     await pool.end();
//   }
// }

// main();
