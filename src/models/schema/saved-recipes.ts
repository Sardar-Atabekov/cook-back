import { pgTable, serial, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';
import { recipes } from './recipes';

export const savedRecipes = pgTable('saved_recipes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  recipeId: integer('recipe_id').references(() => recipes.id),
  createdAt: timestamp('created_at').defaultNow(),
});
