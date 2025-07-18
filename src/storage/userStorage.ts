import { db } from '@/storage/db';
import {
  users,
  type User,
  type InsertUser,
  savedRecipes,
  recipes,
  Recipe,
  SavedRecipe,
  diets,
  kitchens,
  mealTypes,
} from '@/models';
import { and, asc, desc, eq, getTableColumns } from 'drizzle-orm';

export const userStorage = {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  },

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  },

  /**
   * @description МАКСИМАЛЬНО БЫСТРЫЙ метод для получения сохраненных рецептов пользователя.
   * Возвращает все поля рецепта.
   */

  async getUserSavedRecipes(
    userId: number,
    limit: number,
    offset: number
  ): Promise<Recipe[]> {
    return db
      .select(getTableColumns(recipes))
      .from(savedRecipes)
      .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
      .where(eq(savedRecipes.userId, userId))
      .orderBy(desc(savedRecipes.createdAt), asc(recipes.id)) // Стабильная сортировка
      .limit(limit)
      .offset(offset);
  },

  /**
   * @description Сохраняет рецепт для пользователя.
   */
  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
  },

  /**
   * @description Удаляет рецепт из сохраненных у пользователя.
   */
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

  /**
   * @description Получает все существующие теги.
   */
  async getAllTags() {
    const [mealTypesData, dietsData, kitchensData] = await Promise.all([
      db.select().from(mealTypes),
      db.select().from(diets),
      db.select().from(kitchens),
    ]);
    return [
      ...mealTypesData.map((t) => ({ ...t, type: 'meal_type' as const })),
      ...dietsData.map((t) => ({ ...t, type: 'diet' as const })),
      ...kitchensData.map((t) => ({ ...t, type: 'kitchen' as const })),
    ];
  },
};
