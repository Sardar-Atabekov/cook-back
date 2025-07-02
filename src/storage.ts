import {
  users,
  ingredients,
  ingredientCategories,
  recipes,
  recipeIngredients,
  savedRecipes,
  type User,
  type InsertUser,
  type Ingredient,
  type IngredientCategory,
  type Recipe,
  type RecipeIngredient,
  type RecipeWithIngredients,
  type SavedRecipe,
} from '@/models/schema';
import { db } from './db';
import { eq, inArray, sql, and } from 'drizzle-orm';

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Ingredient operations
  getIngredientCategories(): Promise<IngredientCategory[]>;
  getIngredientsByCategory(categoryId: number): Promise<Ingredient[]>;
  getAllIngredients(): Promise<Ingredient[]>;
  searchIngredients(query: string): Promise<Ingredient[]>;

  // Recipe operations
  getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number
  ): Promise<RecipeWithIngredients[]>;
  getRecipeById(id: number): Promise<RecipeWithIngredients | undefined>;
  searchRecipes(query: string): Promise<Recipe[]>;

  // Saved recipes
  saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe>;
  unsaveRecipe(userId: number, recipeId: number): Promise<void>;
  getUserSavedRecipes(userId: number): Promise<RecipeWithIngredients[]>;

  // Data seeding
  seedData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getIngredientCategories(): Promise<IngredientCategory[]> {
    return await db.select().from(ingredientCategories);
  }

  async getIngredientsByCategory(categoryId: number): Promise<Ingredient[]> {
    return await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.categoryId, categoryId));
  }

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
      .filter((row) => row.ingredient_categories) // Ensure join succeeded
      .map((row) => ({
        ...row.ingredients,
        categoryId: row.ingredients.categoryId,
        categoryName: row.ingredient_categories!.name,
        category: {
          id: row.ingredient_categories!.id,
          name: row.ingredient_categories!.name,
        },
      }));
  }

  async searchIngredients(query: string): Promise<Ingredient[]> {
    return await db
      .select()
      .from(ingredients)
      .where(sql`${ingredients.name} ILIKE ${`%${query}%`}`);
  }

  async getRecipes(
    ingredientIds: number[],
    limit: number,
    offset: number
  ): Promise<RecipeWithIngredients[]> {
    if (ingredientIds.length === 0) {
      // Return all recipes if no ingredients selected
      const recipesResult = await db
        .select()
        .from(recipes)
        .limit(limit)
        .offset(offset);

      const recipeIds = recipesResult.map((r) => r.id);
      const recipeIngredientsResult = await db
        .select({
          recipeIngredient: recipeIngredients,
          ingredient: ingredients,
        })
        .from(recipeIngredients)
        .innerJoin(
          ingredients,
          eq(recipeIngredients.ingredientId, ingredients.id)
        )
        .where(inArray(recipeIngredients.recipeId, recipeIds));

      return recipesResult.map((recipe) => ({
        ...recipe,
        recipeIngredients: recipeIngredientsResult
          .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
          .map((ri) => ({
            ...ri.recipeIngredient,
            ingredient: ri.ingredient,
          })),
      }));
    }

    // Find recipes that use any of the selected ingredients
    const recipesResult = await db
      .select({
        recipe: recipes,
        matchCount: sql<number>`COUNT(DISTINCT ${recipeIngredients.ingredientId})`,
      })
      .from(recipes)
      .innerJoin(recipeIngredients, eq(recipes.id, recipeIngredients.recipeId))
      .where(inArray(recipeIngredients.ingredientId, ingredientIds))
      .groupBy(recipes.id)
      .orderBy(sql`COUNT(DISTINCT ${recipeIngredients.ingredientId}) DESC`)
      .limit(limit)
      .offset(offset);

    const recipeIds = recipesResult.map((r) => r.recipe.id);
    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(inArray(recipeIngredients.recipeId, recipeIds));

    return recipesResult.map(({ recipe }) => ({
      ...recipe,
      recipeIngredients: recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ({
          ...ri.recipeIngredient,
          ingredient: ri.ingredient,
        })),
    }));
  }

  async getRecipeById(id: number): Promise<RecipeWithIngredients | undefined> {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(eq(recipeIngredients.recipeId, id));

    return {
      ...recipe,
      recipeIngredients: recipeIngredientsResult.map((ri) => ({
        ...ri.recipeIngredient,
        ingredient: ri.ingredient,
      })),
    };
  }

  async searchRecipes(query: string): Promise<Recipe[]> {
    return await db
      .select()
      .from(recipes)
      .where(sql`${recipes.title} ILIKE ${`%${query}%`}`);
  }

  async saveRecipe(userId: number, recipeId: number): Promise<SavedRecipe> {
    const [savedRecipe] = await db
      .insert(savedRecipes)
      .values({ userId, recipeId })
      .returning();
    return savedRecipe;
  }

  async unsaveRecipe(userId: number, recipeId: number): Promise<void> {
    await db
      .delete(savedRecipes)
      .where(
        and(
          eq(savedRecipes.userId, userId),
          eq(savedRecipes.recipeId, recipeId)
        )
      );
  }

  async getUserSavedRecipes(userId: number): Promise<RecipeWithIngredients[]> {
    const savedRecipesResult = await db
      .select({ recipe: recipes })
      .from(savedRecipes)
      .innerJoin(recipes, eq(savedRecipes.recipeId, recipes.id))
      .where(eq(savedRecipes.userId, userId));

    const recipeIds = savedRecipesResult.map((sr) => sr.recipe.id);
    if (recipeIds.length === 0) return [];

    const recipeIngredientsResult = await db
      .select({
        recipeIngredient: recipeIngredients,
        ingredient: ingredients,
      })
      .from(recipeIngredients)
      .innerJoin(
        ingredients,
        eq(recipeIngredients.ingredientId, ingredients.id)
      )
      .where(inArray(recipeIngredients.recipeId, recipeIds));

    return savedRecipesResult.map(({ recipe }) => ({
      ...recipe,
      recipeIngredients: recipeIngredientsResult
        .filter((ri) => ri.recipeIngredient.recipeId === recipe.id)
        .map((ri) => ({
          ...ri.recipeIngredient,
          ingredient: ri.ingredient,
        })),
    }));
  }

  async seedData(): Promise<void> {
    // Check if data already exists
    const existingCategories = await db.select().from(ingredientCategories);
    if (existingCategories.length > 0) return;

    // Insert ingredient categories
    const categories = [
      {
        name: 'Pantry Essentials',
        icon: 'fas fa-shopping-basket',
        color: 'orange',
      },
      { name: 'Vegetables & Greens', icon: 'fas fa-leaf', color: 'green' },
      { name: 'Fruits', icon: 'fas fa-apple-alt', color: 'red' },
      { name: 'Meats', icon: 'fas fa-drumstick-bite', color: 'red' },
      { name: 'Dairy & Eggs', icon: 'fas fa-cheese', color: 'yellow' },
      { name: 'Herbs & Spices', icon: 'fas fa-seedling', color: 'green' },
      { name: 'Grains & Cereals', icon: 'fas fa-wheat', color: 'brown' },
      { name: 'Seafood', icon: 'fas fa-fish', color: 'blue' },
    ];

    const insertedCategories = await db
      .insert(ingredientCategories)
      .values(categories)
      .returning();

    // Insert ingredients
    const pantryIngredients = [
      'butter',
      'egg',
      'garlic',
      'milk',
      'onion',
      'sugar',
      'flour',
      'olive oil',
      'salt',
      'pepper',
    ];
    const vegetableIngredients = [
      'bell pepper',
      'carrot',
      'tomato',
      'potato',
      'celery',
      'avocado',
      'zucchini',
      'cucumber',
      'corn',
    ];
    const fruitIngredients = [
      'lemon',
      'lime',
      'apple',
      'banana',
      'orange',
      'strawberry',
      'blueberry',
    ];
    const meatIngredients = [
      'chicken breast',
      'ground beef',
      'bacon',
      'salmon',
      'shrimp',
    ];
    const dairyIngredients = ['cheese', 'cream', 'yogurt', 'sour cream'];
    const spiceIngredients = [
      'cinnamon',
      'parsley',
      'cilantro',
      'basil',
      'thyme',
    ];
    const grainIngredients = ['rice', 'pasta', 'bread', 'oats'];
    const seafoodIngredients = ['tuna', 'cod', 'scallops'];

    const allIngredients = [
      ...pantryIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[0].id,
      })),
      ...vegetableIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[1].id,
      })),
      ...fruitIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[2].id,
      })),
      ...meatIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[3].id,
      })),
      ...dairyIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[4].id,
      })),
      ...spiceIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[5].id,
      })),
      ...grainIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[6].id,
      })),
      ...seafoodIngredients.map((name) => ({
        name,
        categoryId: insertedCategories[7].id,
      })),
    ];

    const insertedIngredients = await db
      .insert(ingredients)
      .values(allIngredients)
      .returning();

    // Insert sample recipes with realistic data
    const sampleRecipes = [
      {
        title: 'Classic French Toast',
        description:
          'Perfect breakfast with a crispy exterior and custardy center',
        prepTime: 15,
        servings: 4,
        difficulty: 'Easy',
        imageUrl:
          'https://images.unsplash.com/photo-1484723091739-30a097e8f929?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300',
        instructions: [
          'Beat eggs with milk and cinnamon',
          'Dip bread slices in mixture',
          'Cook in buttered pan until golden',
          'Serve with syrup',
        ],
      },
      {
        title: 'Perfect Scrambled Eggs',
        description: 'Creamy, restaurant-quality scrambled eggs',
        prepTime: 5,
        servings: 2,
        difficulty: 'Easy',
        imageUrl:
          'https://images.unsplash.com/photo-1525351484163-7529414344d8?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300',
        instructions: [
          'Beat eggs with salt and pepper',
          'Heat butter in pan',
          'Add eggs and stir continuously',
          'Remove from heat when still slightly wet',
        ],
      },
      {
        title: 'Fresh Egg Pasta',
        description: 'Silky homemade pasta with just flour and eggs',
        prepTime: 45,
        servings: 4,
        difficulty: 'Medium',
        imageUrl:
          'https://images.unsplash.com/photo-1551183053-bf91a1d81141?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300',
        instructions: [
          'Make well with flour',
          'Add eggs to center',
          'Mix until dough forms',
          'Knead and roll thin',
          'Cut into strips',
        ],
      },
      {
        title: 'Garlic Butter Chicken',
        description: 'Juicy chicken breast with aromatic garlic butter',
        prepTime: 25,
        servings: 4,
        difficulty: 'Medium',
        imageUrl:
          'https://images.unsplash.com/photo-1532550907401-a500c9a57435?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300',
        instructions: [
          'Season chicken with salt and pepper',
          'Sear in hot pan',
          'Add butter and garlic',
          'Finish in oven',
        ],
      },
      {
        title: 'Simple Rice Pilaf',
        description: 'Fluffy rice with herbs and aromatics',
        prepTime: 30,
        servings: 6,
        difficulty: 'Easy',
        imageUrl:
          'https://images.unsplash.com/photo-1586201375761-83865001e31c?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=300',
        instructions: [
          'Sauté onion in butter',
          'Add rice and toast',
          'Add broth and herbs',
          'Simmer until tender',
        ],
      },
    ];

    const insertedRecipes = await db
      .insert(recipes)
      .values(sampleRecipes)
      .returning();

    // Create recipe-ingredient relationships
    const recipeIngredientData = [
      // French Toast
      {
        recipeId: insertedRecipes[0].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'egg')?.id!,
        amount: '4 large',
      },
      {
        recipeId: insertedRecipes[0].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'milk')?.id!,
        amount: '1/2 cup',
      },
      {
        recipeId: insertedRecipes[0].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'butter')?.id!,
        amount: '2 tbsp',
      },
      {
        recipeId: insertedRecipes[0].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'bread')?.id!,
        amount: '8 slices',
      },
      {
        recipeId: insertedRecipes[0].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'cinnamon')
          ?.id!,
        amount: '1 tsp',
      },

      // Scrambled Eggs
      {
        recipeId: insertedRecipes[1].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'egg')?.id!,
        amount: '6 large',
      },
      {
        recipeId: insertedRecipes[1].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'butter')?.id!,
        amount: '2 tbsp',
      },

      // Fresh Pasta
      {
        recipeId: insertedRecipes[2].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'flour')?.id!,
        amount: '2 cups',
      },
      {
        recipeId: insertedRecipes[2].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'egg')?.id!,
        amount: '3 large',
      },

      // Garlic Butter Chicken
      {
        recipeId: insertedRecipes[3].id,
        ingredientId: insertedIngredients.find(
          (i) => i.name === 'chicken breast'
        )?.id!,
        amount: '4 pieces',
      },
      {
        recipeId: insertedRecipes[3].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'garlic')?.id!,
        amount: '4 cloves',
      },
      {
        recipeId: insertedRecipes[3].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'butter')?.id!,
        amount: '3 tbsp',
      },

      // Rice Pilaf
      {
        recipeId: insertedRecipes[4].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'rice')?.id!,
        amount: '1 1/2 cups',
      },
      {
        recipeId: insertedRecipes[4].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'onion')?.id!,
        amount: '1 medium',
      },
      {
        recipeId: insertedRecipes[4].id,
        ingredientId: insertedIngredients.find((i) => i.name === 'butter')?.id!,
        amount: '2 tbsp',
      },
    ];

    await db
      .insert(recipeIngredients)
      .values(recipeIngredientData.filter((ri) => ri.ingredientId));
  }
}

export const storage = new DatabaseStorage();
