import {
  pgTable,
  serial,
  integer,
  boolean,
  timestamp,
  text,
  jsonb,
} from 'drizzle-orm/pg-core';
import { ingredientCategories } from './ingredient-categories';

export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => ingredientCategories.id),
  primaryName: text('primary_name').notNull(),
  isActive: boolean('is_active').default(true),
  aliases: jsonb('aliases'),
  nutritionalData: jsonb('nutritional_data'),
  lastSyncAt: timestamp('last_sync_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
