import { pgTable, serial, integer, text, boolean } from 'drizzle-orm/pg-core';
import { recipes } from './recipes';
import { ingredients } from './ingredients';

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id').references(() => recipes.id),
  ingredientId: integer('ingredient_id').references(() => ingredients.id),
  amount: text('amount'),
  required: boolean('required').default(true),
});
