import { Request, Response } from 'express';
import { ingredientStorage } from '../storage/ingredientStorage';
import { syncSupercookIngredients } from '@/lib/supercook-parser';

export async function getCategories(req: Request, res: Response) {
  try {
    const language = req.language || 'en'; // Получаем язык из запроса
    const categories =
      await ingredientStorage.getIngredientCategories(language);
    res.json(categories);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
}

export async function getIngredients(req: Request, res: Response) {
  try {
    const { categoryId, search } = req.query;
    const language = req.language || 'en'; // Получаем язык из запроса

    let ingredients;
    if (search) {
      ingredients = await ingredientStorage.searchIngredients(
        search as string,
        language
      );
    } else if (categoryId) {
      // categoryId теперь UUID, а не число
      ingredients = await ingredientStorage.getIngredientsByCategory(
        categoryId as string,
        language
      );
    } else {
      ingredients = await ingredientStorage.getAllIngredients(language);
    }

    res.json(ingredients);
  } catch (error) {
    console.error('Failed to fetch ingredients:', error);
    res.status(500).json({ message: 'Failed to fetch ingredients' });
  }
}

export async function getGroupedIngredients(req: Request, res: Response) {
  try {
    const language = (req.query.lang as string) || 'en';
    console.log(language);
    await syncSupercookIngredients(language); // await добавим на всякий случай
    const data =
      await ingredientStorage.getGroupedIngredientsByCategory(language);
    res.json(data);
  } catch (error) {
    console.error('Failed to fetch grouped ingredients:', error);
    res.status(500).json({ message: 'Failed to fetch grouped ingredients' });
  }
}
