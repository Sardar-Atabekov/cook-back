import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ingredientCategories } from './ingredient-categories';

export const ingredientCategoryTranslations = pgTable(
  'ingredient_category_translations',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => ingredientCategories.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (table) => ({
    unq: uniqueIndex('category_language_unq').on(
      table.categoryId,
      table.language
    ),
  })
);
