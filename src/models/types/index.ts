import { z } from 'zod';
import { users } from '../schema/users';
import { ingredientCategories } from '../schema/ingredient-categories';
import { ingredients } from '../schema/ingredients';
import { recipes } from '../schema/recipes';
import { recipeIngredients } from '../schema/recipe-ingredients';
import { savedRecipes } from '../schema/saved-recipes';
import { insertUserSchema } from '../zod';

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type IngredientCategory = typeof ingredientCategories.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type SavedRecipe = typeof savedRecipes.$inferSelect;

export type RecipeWithIngredients = Recipe & {
  recipeIngredients: RecipeIngredient[];
};

export type RecipeWithIngredientsAndTags = RecipeWithIngredients & {
  mealTypes: Array<{ tag: string; name: string; slug: string }>;
  diets: Array<{ tag: string; name: string; slug: string }>;
  kitchens: Array<{ tag: string; name: string; slug: string }>;
};

export type IngredientWithCategory = Ingredient & {
  category: IngredientCategory;
};
