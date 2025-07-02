import { db } from './db';
import {
  ingredientCategories,
  ingredients,
  recipes,
  recipeIngredients,
} from '@/models/schema';

export async function runSeed() {
  const existingCategories = await db.select().from(ingredientCategories);
  if (existingCategories.length > 0) return;

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

  const ingredientList = {
    pantry: [
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
    ],
    vegetables: [
      'bell pepper',
      'carrot',
      'tomato',
      'potato',
      'celery',
      'avocado',
      'zucchini',
      'cucumber',
      'corn',
    ],
    fruits: [
      'lemon',
      'lime',
      'apple',
      'banana',
      'orange',
      'strawberry',
      'blueberry',
    ],
    meats: ['chicken breast', 'ground beef', 'bacon', 'salmon', 'shrimp'],
    dairy: ['cheese', 'cream', 'yogurt', 'sour cream'],
    spices: ['cinnamon', 'parsley', 'cilantro', 'basil', 'thyme'],
    grains: ['rice', 'pasta', 'bread', 'oats'],
    seafood: ['tuna', 'cod', 'scallops'],
  };

  const allIngredients = [
    ...ingredientList.pantry.map((name) => ({
      name,
      categoryId: insertedCategories[0].id,
    })),
    ...ingredientList.vegetables.map((name) => ({
      name,
      categoryId: insertedCategories[1].id,
    })),
    ...ingredientList.fruits.map((name) => ({
      name,
      categoryId: insertedCategories[2].id,
    })),
    ...ingredientList.meats.map((name) => ({
      name,
      categoryId: insertedCategories[3].id,
    })),
    ...ingredientList.dairy.map((name) => ({
      name,
      categoryId: insertedCategories[4].id,
    })),
    ...ingredientList.spices.map((name) => ({
      name,
      categoryId: insertedCategories[5].id,
    })),
    ...ingredientList.grains.map((name) => ({
      name,
      categoryId: insertedCategories[6].id,
    })),
    ...ingredientList.seafood.map((name) => ({
      name,
      categoryId: insertedCategories[7].id,
    })),
  ];

  const insertedIngredients = await db
    .insert(ingredients)
    .values(allIngredients)
    .returning();

  const sampleRecipes = [
    {
      title: 'Classic French Toast',
      description:
        'Perfect breakfast with a crispy exterior and custardy center',
      prepTime: 15,
      servings: 4,
      difficulty: 'Easy',
      imageUrl:
        'https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&w=400&h=300',
      instructions: [
        'Beat eggs with milk and cinnamon',
        'Dip bread slices',
        'Cook in buttered pan',
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
        'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=400&h=300',
      instructions: [
        'Beat eggs',
        'Heat butter',
        'Stir eggs continuously',
        'Remove slightly wet',
      ],
    },
    {
      title: 'Fresh Egg Pasta',
      description: 'Silky homemade pasta with flour and eggs',
      prepTime: 45,
      servings: 4,
      difficulty: 'Medium',
      imageUrl:
        'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=400&h=300',
      instructions: ['Make well', 'Add eggs', 'Mix and knead', 'Roll and cut'],
    },
  ];

  const insertedRecipes = await db
    .insert(recipes)
    .values(sampleRecipes)
    .returning();

  const ingredientId = (name: string) =>
    insertedIngredients.find((i) => i.name === name)?.id ??
    (() => {
      throw new Error(`Missing ingredient: ${name}`);
    })();

  const recipeIngredientData = [
    { recipe: 0, name: 'egg', amount: '4 large' },
    { recipe: 0, name: 'milk', amount: '1/2 cup' },
    { recipe: 0, name: 'butter', amount: '2 tbsp' },
    { recipe: 0, name: 'bread', amount: '8 slices' },
    { recipe: 0, name: 'cinnamon', amount: '1 tsp' },

    { recipe: 1, name: 'egg', amount: '6 large' },
    { recipe: 1, name: 'butter', amount: '2 tbsp' },

    { recipe: 2, name: 'flour', amount: '2 cups' },
    { recipe: 2, name: 'egg', amount: '3 large' },
  ];

  const toInsert = recipeIngredientData.map((ri) => ({
    recipeId: insertedRecipes[ri.recipe].id,
    ingredientId: ingredientId(ri.name),
    amount: ri.amount,
  }));

  await db.insert(recipeIngredients).values(toInsert);
}
