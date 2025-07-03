import { createInsertSchema } from 'drizzle-zod';
import { users } from '../schema/users';
import { ingredientCategories } from '../schema/ingredient-categories';
import { ingredients } from '../schema/ingredients';
import { recipes } from '../schema/recipes';
import { recipeIngredients } from '../schema/recipe-ingredients';
import { savedRecipes } from '../schema/saved-recipes';

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const insertIngredientCategorySchema =
  createInsertSchema(ingredientCategories);
export const insertIngredientSchema = createInsertSchema(ingredients);
export const insertRecipeSchema = createInsertSchema(recipes);
export const insertRecipeIngredientSchema =
  createInsertSchema(recipeIngredients);
export const insertSavedRecipeSchema = createInsertSchema(savedRecipes);
