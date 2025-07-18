import { Request, Response } from 'express';
import { ingredientStorage } from '../storage/ingredientStorage';
import { cache } from '../storage/redis';

export async function getCategories(req: Request, res: Response) {
  try {
    const language = (req.query.language as string) || 'en';
    const cacheKey = `categories:${language}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    const categories =
      await ingredientStorage.getIngredientCategories(language);
    // Кэшируем категории на 7 дней
    await cache.setex(cacheKey, 604800, JSON.stringify(categories));
    res.json(categories);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
}

export async function getIngredients(req: Request, res: Response) {
  try {
    const { categoryId, search } = req.query;
    const language = (req.query.language as string) || 'en';

    let ingredients;
    if (search) {
      ingredients = await ingredientStorage.searchIngredients(
        search as string,
        language
      );
    } else if (categoryId) {
      ingredients = await ingredientStorage.getIngredientsByCategory(
        Number(categoryId),
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
    const cacheKey = `grouped_ingredients:${language}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    console.log(language);
    const data = await ingredientStorage.getFullIngredientTree(language);
    console.log('data', data);
    // Кэшируем группированные ингредиенты на 7 дней
    await cache.setex(cacheKey, 604800, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Failed to fetch grouped ingredients:', error);
    res.status(500).json({ message: 'Failed to fetch grouped ingredients' });
  }
}
