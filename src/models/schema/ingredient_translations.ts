import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ingredients } from './ingredients';

export const ingredientTranslations = pgTable(
  'ingredient_translations',
  {
    id: serial('id').primaryKey(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    name: text('name').notNull(),
  },
  (table) => ({
    unq: uniqueIndex('ingredient_language_unq').on(
      table.ingredientId,
      table.language
    ),
  })
);
