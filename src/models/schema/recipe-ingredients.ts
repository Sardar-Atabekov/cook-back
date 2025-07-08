import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { recipes } from './recipes';
import { ingredients } from './ingredients';

export const recipeIngredients = pgTable('recipe_ingredients', {
   id: serial('id').primaryKey(),
  recipeId: integer('recipe_id')
    .notNull()
    .references(() => recipes.id),
  line: text('line').notNull(),
  matchedName: text('matched_name'),
  ingredientId: integer('ingredient_id').references(() => ingredients.id), // может быть null
  createdAt: timestamp('created_at').defaultNow(),
});

