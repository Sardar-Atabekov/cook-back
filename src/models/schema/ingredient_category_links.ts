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
import { ingredientCategories } from './ingredient-categories';

export const ingredientCategoryLinks = pgTable(
  'ingredient_category_links',
  {
    id: serial('id').primaryKey(),
    ingredientId: integer('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => ingredientCategories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    unq_ingredient_category: uniqueIndex('unique_ingredient_category').on(
      table.ingredientId,
      table.categoryId
    ),
  })
);
