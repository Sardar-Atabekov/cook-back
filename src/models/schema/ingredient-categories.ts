import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  text,
} from 'drizzle-orm/pg-core';

export const ingredientCategories = pgTable('ingredient_categories', {
  id: serial('id').primaryKey(),
  parentId: integer('parent_id'),
  level: integer('level').default(0),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
