import axios from 'axios';
import { db } from '@/storage/db';
import {
  ingredientCategories,
  ingredients,
  ingredientCategoryTranslations,
  ingredientTranslations,
} from '@/models';
import { eq } from 'drizzle-orm';

interface SupercookIngredientRaw {
  term?: string;
  display_name: string;
}
interface SupercookCategoryRaw {
  group_name: string;
  ingredients: SupercookIngredientRaw[] | { ingredients: string[] };
}

interface SupercookIngredient {
  term: string;
  display_name: string;
}
interface SupercookCategory {
  group_name: string;
  ingredients: SupercookIngredient[];
}

type SupercookApiResponse = Record<
  string,
  SupercookIngredientRaw[] | { ingredients: string[] }
>;

async function fetchSupercookData(
  language: string = 'ru'
): Promise<SupercookCategory[]> {
  const url = 'https://d1.supercook.com/dyn/lang_ings';
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64 ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  };
  const payload = new URLSearchParams({ lang: language, cv: '2' }).toString();

  const response = await axios.post<SupercookApiResponse>(url, payload, {
    headers,
  });

  return Object.entries(response.data).map(([group_name, rawItems]) => {
    // Normalize ingredients array
    let items: SupercookIngredientRaw[] = [];
    if (Array.isArray(rawItems)) {
      items = rawItems;
    } else if (
      'ingredients' in rawItems &&
      Array.isArray(rawItems.ingredients)
    ) {
      items = rawItems.ingredients.map(
        (name) => ({ display_name: name }) as SupercookIngredientRaw
      );
    }
    // Convert to uniform type
    const ingredients: SupercookIngredient[] = items.map((item) => ({
      term: item.term?.trim() || item.display_name.trim(),
      display_name: item.display_name.trim(),
    }));

    return { group_name, ingredients };
  });
}

export async function syncSupercookIngredients(language: string) {
  if (!language) return;
  const apiCategories = await fetchSupercookData(language);

  // Load existing data
  const existingCats = await db.select().from(ingredientCategories);
  const 
   = await db.select().from(ingredients);

  const catMap = new Map<string, number>();
  existingCats.forEach((cat) => catMap.set(cat.primaryName, cat.id));

  const ingMap = new Map<string, number>();
  existingIngs.forEach((ing) => ingMap.set(ing.primaryName, ing.id));

  const newCategories: Array<Partial<typeof ingredientCategories._type>> = [];
  const newCategoryTrans: Array<
    Partial<typeof ingredientCategoryTranslations._type>
  > = [];
  const newIngredientsArr: Array<Partial<typeof ingredients._type>> = [];
  const newIngTrans: Array<Partial<typeof ingredientTranslations._type>> = [];

  for (const cat of apiCategories) {
    const key = cat.group_name.toLowerCase();
    let catId = catMap.get(key);
    if (!catId) {
      // create new category
      const insert = {
        primaryName: cat.group_name,
        isActive: true,
        parentId: null,
        level: 0,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      newCategories.push(insert);
      // Drizzle serial key will be assigned, but we need id for translations; we can insert categories first
      // Use placeholder, will re-query after insert
    }
  }

  await db.transaction(async (tx) => {
    // Insert categories and fetch with ids
    if (newCategories.length) {
      await tx.insert(ingredientCategories).values(newCategories);
    }
    const updatedCats = await tx.select().from(ingredientCategories);
    catMap.clear();
    updatedCats.forEach((cat) =>
      catMap.set(cat.primaryName.toLowerCase(), cat.id)
    );

    // Build translations and ingredients after categories exist
    for (const cat of apiCategories) {
      const catId = catMap.get(cat.group_name.toLowerCase());
      if (!catId) {
        console.error('Не найден catId для категории:', cat.group_name);
        continue;
      }
      newCategoryTrans.push({
        categoryId: catId,
        language,
        name: cat.group_name,
      });
      // ingredients
      for (const ing of cat.ingredients) {
        const ik = ing.term.toLowerCase();
        let ingId = ingMap.get(ik);
        if (!ingId) {
          const insertIng = {
            categoryId: catId,
            primaryName: ing.term,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSyncAt: new Date(),
          };
          newIngredientsArr.push(insertIng);
        }
      }
    }

    if (newIngredientsArr.length) {
      await tx.insert(ingredients).values(newIngredientsArr);
    }
    const updatedIngs = await tx.select().from(ingredients);
    ingMap.clear();
    updatedIngs.forEach((ing) =>
      ingMap.set(ing.primaryName.toLowerCase(), ing.id)
    );

    // Now insert translations
    const catTransserts = newCategoryTrans.map((t) => ({
      categoryId: t.categoryId!,
      language: t.language!,
      name: t.name!,
      description: t.description || null,
    }));
    await tx.insert(ingredientCategoryTranslations).values(catTransserts);

    for (const cat of apiCategories) {
      const cid = catMap.get(cat.group_name.toLowerCase())!;
      for (const ing of cat.ingredients) {
        const term = ing.term?.trim() || ing.display_name?.trim();
        if (!term) {
          console.error('Ингредиент без имени:', ing);
          continue; // или задайте уникальное значение по умолчанию
        }
        const ik = term.toLowerCase();
        let ingId = ingMap.get(ik);
        if (!ingId) {
          const insertIng = {
            categoryId: catId,
            primaryName: term,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSyncAt: new Date(),
          };
          newIngredientsArr.push(insertIng);
        }
      }
    }
    if (newIngTrans.length)
      await tx.insert(ingredientTranslations).values(newIngTrans);
  });

  console.log('Синхронизация завершена');
}
