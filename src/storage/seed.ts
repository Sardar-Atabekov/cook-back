import { db } from './db';
import {
  ingredientCategories,
  ingredients,
  recipes,
  recipeIngredients,
} from '@/models';
import { syncSupercookIngredients } from '@/lib/supercook-parser';

// Запускаем полную синхронизацию для русского языка

export async function runSeed() {
  try {
    const existingCategories = await db.select().from(ingredientCategories);
    // if (existingCategories.length > 0) {
    //   console.log('⚠️ Seed already exists. Skipping.');
    //   return;
    // }
    await db.delete(recipeIngredients);
    await db.delete(ingredientCategories);
    await db.delete(ingredients);
    await db.delete(recipes);
    // const categoryData = [
    //   {
    //     names: 'Pantry Essentials',
    //     icon: 'fas fa-shopping-basket',
    //     color: 'orange',
    //     ingredients: [
    //       'butter',
    //       'egg',
    //       'garlic',
    //       'milk',
    //       'onion',
    //       'sugar',
    //       'flour',
    //       'olive oil',
    //       'salt',
    //       'pepper',
    //     ],
    //   },
    //   {
    //     names: 'Vegetables & Greens',
    //     icon: 'fas fa-leaf',
    //     color: 'green',
    //     ingredients: [
    //       'bell pepper',
    //       'carrot',
    //       'tomato',
    //       'potato',
    //       'celery',
    //       'avocado',
    //       'zucchini',
    //       'cucumber',
    //       'corn',
    //     ],
    //   },
    //   {
    //     names: 'Fruits',
    //     icon: 'fas fa-apple-alt',
    //     color: 'red',
    //     ingredients: [
    //       'lemon',
    //       'lime',
    //       'apple',
    //       'banana',
    //       'orange',
    //       'strawberry',
    //       'blueberry',
    //     ],
    //   },
    //   {
    //     names: 'Meats',
    //     icon: 'fas fa-drumstick-bite',
    //     color: 'red',
    //     ingredients: [
    //       'chicken breast',
    //       'ground beef',
    //       'bacon',
    //       'salmon',
    //       'shrimp',
    //     ],
    //   },
    //   {
    //     names: 'Dairy & Eggs',
    //     icon: 'fas fa-cheese',
    //     color: 'yellow',
    //     ingredients: ['cheese', 'cream', 'yogurt', 'sour cream'],
    //   },
    //   {
    //     names: 'Herbs & Spices',
    //     icon: 'fas fa-seedling',
    //     color: 'green',
    //     ingredients: ['cinnamon', 'parsley', 'cilantro', 'basil', 'thyme'],
    //   },
    //   {
    //     names: 'Grains & Cereals',
    //     icon: 'fas fa-wheat',
    //     color: 'brown',
    //     ingredients: ['rice', 'pasta', 'bread', 'oats'],
    //   },
    //   {
    //     names: 'Seafood',
    //     icon: 'fas fa-fish',
    //     color: 'blue',
    //     ingredients: ['tuna', 'cod', 'scallops'],
    //   },
    // ];

    // // 1. Insert categories
    // await db
    //   .insert(ingredientCategories)
    //   .values(
    //     categoryData.map(({ names, icon, color }) => ({ names, icon, color }))
    //   );
    // const insertedCategories = await db.select().from(ingredientCategories);
    // console.log(`✅ Inserted ${insertedCategories.length} categories.`);

    // // 2. Prepare ingredients
    // const allIngredients = categoryData.flatMap((cat) => {
    //   const category = insertedCategories.find((c) => c.names === cat.names);
    //   if (!category) throw new Error(`Missing category: ${cat.names}`);

    //   return cat.ingredients.map((ingredientName) => ({
    //     name: ingredientName,
    //     categoryId: category.id,
    //     categoryName: cat.names, // можно оставить, если нужно где-то использовать
    //   }));
    // });

    // // 3. Insert ingredients
    // await db.insert(ingredients).values(
    //   allIngredients.map(({ name, categoryId }) => ({
    //     names: name,
    //     categoryId,
    //   }))
    // );
    // const insertedIngredients = await db.select().from(ingredients);
    // console.log(`✅ Inserted ${insertedIngredients.length} ingredients.`);

    // 4. Insert sample recipes
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
        instructions: [
          'Make well',
          'Add eggs',
          'Mix and knead',
          'Roll and cut',
        ],
      },
    ];

    await db.insert(recipes).values(sampleRecipes);
    const insertedRecipes = await db.select().from(recipes);
    console.log(`✅ Inserted ${insertedRecipes.length} recipes.`);

    // // 5. Insert ingredients into recipes
    // const ingredientId = (name: string) => {
    //   const found = insertedIngredients.find((i) => i.names === name);
    //   if (!found) throw new Error(`Missing ingredient: ${name}`);
    //   return found.id;
    // };

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

    // const toInsert = recipeIngredientData.map((ri) => ({
    //   recipeId: insertedRecipes[ri.recipe].id,
    //   ingredientId: ingredientId(ri.name),
    //   amount: ri.amount,
    // }));

    // await db.insert(recipeIngredients).values(toInsert);
    // console.log(`✅ Inserted ${toInsert.length} recipe-ingredients.`);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    throw err;
  }
}
