import {
  users,
  recipes,
  ingredients,
  ingredientCategories,
  recipeIngredients,
  type User,
  type InsertUser,
  type Recipe,
  type Ingredient,
  type IngredientCategory,
  type RecipeFilter,
  type RecipeIngredient,
} from '@shared/schema';
import { db } from './db';
import { eq, inArray, sql, desc, asc } from 'drizzle-orm';

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Ingredient methods
  getIngredients(): Promise<(Ingredient & { category: IngredientCategory })[]>;
  getIngredientsByCategory(): Promise<
    { category: IngredientCategory; ingredients: Ingredient[] }[]
  >;

  // Recipe methods
  getRecipes(limit: number, offset: number): Promise<Recipe[]>;
  getRecipe(id: number): Promise<
    | (Recipe & {
        ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
      })
    | undefined
  >;
  filterRecipesByIngredients(filter: RecipeFilter): Promise<{
    recipes: (Recipe & {
      matchPercentage: number;
      matchingIngredients: number;
      totalIngredients: number;
      missingIngredients: Ingredient[];
    })[];
    total: number;
  }>;

  // Seed methods
  seedData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getIngredients(): Promise<
    (Ingredient & { category: Pick<IngredientCategory, 'id' | 'name'> })[]
  > {
    const rows = await db
      .select()
      .from(ingredients)
      .leftJoin(
        ingredientCategories,
        eq(ingredients.categoryId, ingredientCategories.id)
      );

    return rows.map((row) => ({
      ...row.ingredients,
      category: {
        id: row.ingredient_categories?.id,
        name: row.ingredient_categories?.name,
      },
    }));
  }

  async getIngredientsByCategory(): Promise<
    { category: IngredientCategory; ingredients: Ingredient[] }[]
  > {
    const categories = await db.select().from(ingredientCategories);
    const result: {
      category: IngredientCategory;
      ingredients: Ingredient[];
    }[] = [];

    for (const category of categories) {
      const categoryIngredients = await db
        .select()
        .from(ingredients)
        .where(eq(ingredients.categoryId, category.id));

      result.push({
        category,
        ingredients: categoryIngredients,
      });
    }

    return result;
  }

  async getRecipes(limit: number, offset: number): Promise<Recipe[]> {
    return await db
      .select()
      .from(recipes)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: number): Promise<
    | (Recipe & {
        ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
      })
    | undefined
  > {
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
    if (!recipe) return undefined;

    const recipeIngredientsData = await db
      .select()
      .from(recipeIngredients)
      .leftJoin(ingredients, eq(recipeIngredients.ingredientId, ingredients.id))
      .where(eq(recipeIngredients.recipeId, id));

    return {
      ...recipe,
      ingredients: recipeIngredientsData.map((row) => ({
        ...row.recipe_ingredients,
        ingredient: row.ingredients!,
      })),
    };
  }

  async filterRecipesByIngredients(filter: RecipeFilter): Promise<{
    recipes: (Recipe & {
      matchPercentage: number;
      matchingIngredients: number;
      totalIngredients: number;
      missingIngredients: Ingredient[];
    })[];
    total: number;
  }> {
    const { ingredientIds, limit, offset, sortBy } = filter;

    // First, get all recipes that contain at least one of the selected ingredients
    const matchingRecipeIds = await db
      .selectDistinct({ recipeId: recipeIngredients.recipeId })
      .from(recipeIngredients)
      .where(inArray(recipeIngredients.ingredientId, ingredientIds));

    if (matchingRecipeIds.length === 0) {
      return { recipes: [], total: 0 };
    }

    const recipeIds = matchingRecipeIds.map((r) => r.recipeId);

    // Get detailed information for each matching recipe
    const matchingRecipes = await db
      .select()
      .from(recipes)
      .where(inArray(recipes.id, recipeIds));

    // Calculate match percentages and get missing ingredients
    const enrichedRecipes = await Promise.all(
      matchingRecipes.map(async (recipe) => {
        // Get all ingredients for this recipe
        const allRecipeIngredients = await db
          .select({
            ingredientId: recipeIngredients.ingredientId,
            ingredient: ingredients,
          })
          .from(recipeIngredients)
          .leftJoin(
            ingredients,
            eq(recipeIngredients.ingredientId, ingredients.id)
          )
          .where(eq(recipeIngredients.recipeId, recipe.id));

        const totalIngredients = allRecipeIngredients.length;
        const matchingIngredients = allRecipeIngredients.filter((ri) =>
          ingredientIds.includes(ri.ingredientId)
        ).length;

        const matchPercentage =
          totalIngredients > 0
            ? Math.round((matchingIngredients / totalIngredients) * 100)
            : 0;

        const missingIngredients = allRecipeIngredients
          .filter(
            (ri) => ri.ingredient && !ingredientIds.includes(ri.ingredientId)
          )
          .map((ri) => ri.ingredient!);

        return {
          ...recipe,
          matchPercentage,
          matchingIngredients,
          totalIngredients,
          missingIngredients,
        };
      })
    );

    // Sort recipes
    const sortedRecipes = enrichedRecipes.sort((a, b) => {
      switch (sortBy) {
        case 'match':
          return b.matchPercentage - a.matchPercentage;
        case 'time':
          return a.cookingTime - b.cookingTime;
        case 'difficulty':
          const difficultyOrder = { Easy: 1, Medium: 2, Hard: 3 };
          return (
            difficultyOrder[a.difficulty as keyof typeof difficultyOrder] -
            difficultyOrder[b.difficulty as keyof typeof difficultyOrder]
          );
        default:
          return b.matchPercentage - a.matchPercentage;
      }
    });

    const total = sortedRecipes.length;
    const paginatedRecipes = sortedRecipes.slice(offset, offset + limit);

    return {
      recipes: paginatedRecipes,
      total,
    };
  }

  async seedData(): Promise<void> {
    // Seed ingredient categories
    const categoriesData = [
      { name: 'Vegetables', icon: 'fas fa-carrot' },
      { name: 'Proteins', icon: 'fas fa-fish' },
      { name: 'Dairy', icon: 'fas fa-cheese' },
      { name: 'Grains', icon: 'fas fa-wheat-awn' },
      { name: 'Spices & Herbs', icon: 'fas fa-pepper-hot' },
      { name: 'Pantry', icon: 'fas fa-jar' },
    ];

    const insertedCategories = await db
      .insert(ingredientCategories)
      .values(categoriesData)
      .onConflictDoNothing()
      .returning();

    // Seed ingredients
    const ingredientsData = [
      // Vegetables
      { name: 'Tomatoes', categoryId: 1 },
      { name: 'Onions', categoryId: 1 },
      { name: 'Bell Peppers', categoryId: 1 },
      { name: 'Carrots', categoryId: 1 },
      { name: 'Garlic', categoryId: 1 },
      { name: 'Potatoes', categoryId: 1 },

      // Proteins
      { name: 'Chicken Breast', categoryId: 2 },
      { name: 'Ground Beef', categoryId: 2 },
      { name: 'Eggs', categoryId: 2 },
      { name: 'Salmon', categoryId: 2 },

      // Dairy
      { name: 'Cheese', categoryId: 3 },
      { name: 'Milk', categoryId: 3 },
      { name: 'Butter', categoryId: 3 },
      { name: 'Heavy Cream', categoryId: 3 },
      { name: 'Parmesan Cheese', categoryId: 3 },

      // Grains
      { name: 'Pasta', categoryId: 4 },
      { name: 'Rice', categoryId: 4 },
      { name: 'Bread', categoryId: 4 },

      // Spices & Herbs
      { name: 'Salt', categoryId: 5 },
      { name: 'Black Pepper', categoryId: 5 },
      { name: 'Basil', categoryId: 5 },
      { name: 'Thyme', categoryId: 5 },

      // Pantry
      { name: 'Olive Oil', categoryId: 6 },
      { name: 'Soy Sauce', categoryId: 6 },
      { name: 'Beef Broth', categoryId: 6 },
    ];

    await db.insert(ingredients).values(ingredientsData).onConflictDoNothing();

    // Seed recipes
    const recipesData = [
      {
        title: 'Creamy Chicken Alfredo Pasta',
        description:
          "A rich and creamy pasta dish made with tender chicken, fresh herbs, and a delicious alfredo sauce that's perfect for any dinner.",
        instructions: [
          'Season chicken breasts with salt and pepper. Heat olive oil in a large skillet over medium-high heat.',
          'Cook chicken for 6-7 minutes per side until golden brown and cooked through. Remove and set aside.',
          'Cook pasta according to package directions. Drain and set aside, reserving 1 cup of pasta water.',
          'In the same skillet, melt butter and add minced garlic. Cook for 1 minute until fragrant.',
          'Add heavy cream and bring to a simmer. Add Parmesan cheese and stir until melted and smooth.',
          'Slice chicken and add back to skillet along with cooked pasta. Toss to combine and serve hot.',
        ],
        cookingTime: 30,
        servings: 4,
        difficulty: 'Medium',
        imageUrl:
          'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5',
      },
      {
        title: 'Rainbow Vegetable Stir Fry',
        description:
          'A vibrant and healthy stir fry packed with colorful vegetables and a savory sauce that comes together in minutes.',
        instructions: [
          'Heat oil in a large wok or skillet over high heat.',
          'Add garlic and stir-fry for 30 seconds until fragrant.',
          'Add harder vegetables like carrots and bell peppers first. Stir-fry for 2-3 minutes.',
          'Add remaining vegetables and stir-fry for another 2-3 minutes until crisp-tender.',
          'Add soy sauce and toss to combine. Serve immediately over rice.',
        ],
        cookingTime: 15,
        servings: 2,
        difficulty: 'Easy',
        imageUrl:
          'https://images.unsplash.com/photo-1512621776951-a57141f2eefd',
      },
      {
        title: 'Cheese & Herb Omelet',
        description:
          "A perfect breakfast omelet with fresh herbs and melted cheese that's light, fluffy, and satisfying.",
        instructions: [
          'Beat eggs with salt and pepper in a bowl.',
          'Heat butter in a non-stick pan over medium-low heat.',
          'Pour in eggs and let sit for 30 seconds.',
          'Gently push cooked edges toward center, tilting pan to let uncooked egg flow underneath.',
          'When eggs are almost set, add cheese and herbs to one half.',
          'Fold omelet in half and slide onto plate. Serve immediately.',
        ],
        cookingTime: 10,
        servings: 1,
        difficulty: 'Easy',
        imageUrl:
          'https://images.unsplash.com/photo-1506084868230-bb9d95c24759',
      },
    ];

    const insertedRecipes = await db
      .insert(recipes)
      .values(recipesData)
      .onConflictDoNothing()
      .returning();

    // Seed recipe ingredients
    const recipeIngredientsData = [
      // Chicken Alfredo
      { recipeId: 1, ingredientId: 7, amount: '2 pieces', required: true }, // Chicken Breast
      { recipeId: 1, ingredientId: 16, amount: '8 oz', required: true }, // Pasta
      { recipeId: 1, ingredientId: 5, amount: '3 cloves', required: true }, // Garlic
      { recipeId: 1, ingredientId: 13, amount: '2 tbsp', required: true }, // Butter
      { recipeId: 1, ingredientId: 14, amount: '1 cup', required: true }, // Heavy Cream
      { recipeId: 1, ingredientId: 15, amount: '1 cup', required: true }, // Parmesan
      { recipeId: 1, ingredientId: 23, amount: '2 tbsp', required: true }, // Olive Oil
      { recipeId: 1, ingredientId: 19, amount: 'to taste', required: true }, // Salt
      { recipeId: 1, ingredientId: 20, amount: 'to taste', required: true }, // Pepper

      // Stir Fry
      { recipeId: 2, ingredientId: 2, amount: '1 medium', required: true }, // Onions
      { recipeId: 2, ingredientId: 3, amount: '2 pieces', required: true }, // Bell Peppers
      { recipeId: 2, ingredientId: 4, amount: '2 medium', required: true }, // Carrots
      { recipeId: 2, ingredientId: 5, amount: '2 cloves', required: true }, // Garlic
      { recipeId: 2, ingredientId: 23, amount: '2 tbsp', required: true }, // Olive Oil
      { recipeId: 2, ingredientId: 24, amount: '3 tbsp', required: true }, // Soy Sauce

      // Omelet
      { recipeId: 3, ingredientId: 9, amount: '3 pieces', required: true }, // Eggs
      { recipeId: 3, ingredientId: 11, amount: '1/4 cup', required: true }, // Cheese
      { recipeId: 3, ingredientId: 13, amount: '1 tbsp', required: true }, // Butter
      { recipeId: 3, ingredientId: 21, amount: '1 tsp', required: false }, // Basil
      { recipeId: 3, ingredientId: 19, amount: 'to taste', required: true }, // Salt
      { recipeId: 3, ingredientId: 20, amount: 'to taste', required: true }, // Pepper
    ];

    await db
      .insert(recipeIngredients)
      .values(recipeIngredientsData)
      .onConflictDoNothing();
  }
}

export const storage = new DatabaseStorage();
