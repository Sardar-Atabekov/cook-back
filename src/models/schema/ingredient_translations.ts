import { pgTable, serial, integer, text } from 'drizzle-orm/pg-core';
import { ingredients } from './ingredients';

export const ingredientTranslations = pgTable('ingredient_translations', {
  id: serial('id').primaryKey(),
  ingredientId: integer('ingredient_id')
    .notNull()
    .references(() => ingredients.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  name: text('name').notNull(),
});
