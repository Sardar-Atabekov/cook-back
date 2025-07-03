import { relations } from 'drizzle-orm';
import { ingredientCategories } from '../schema/ingredient-categories';
import { ingredients } from '../schema/ingredients';
import { recipes } from '../schema/recipes';
import { recipeIngredients } from '../schema/recipe-ingredients';
import { savedRecipes } from '../schema/saved-recipes';
import { users } from '../schema/users';

export const ingredientCategoriesRelations = relations(ingredientCategories, ({ many }) => ({
  ingredients: many(ingredients),
}));

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  category: one(ingredientCategories, {
    fields: [ingredients.categoryId],
    references: [ingredientCategories.id],
  }),
  recipeIngredients: many(recipeIngredients),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  recipeIngredients: many(recipeIngredients),
  savedRecipes: many(savedRecipes),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeIngredients.recipeId],
    references: [recipes.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipeIngredients.ingredientId],
    references: [ingredients.id],
  }),
}));

export const savedRecipesRelations = relations(savedRecipes, ({ one }) => ({
  user: one(users, {
    fields: [savedRecipes.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [savedRecipes.recipeId],
    references: [recipes.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  savedRecipes: many(savedRecipes),
}));
