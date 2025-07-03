// models/ingredients.ts
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { ingredientCategories } from './ingredient-categories';

export const ingredients = pgTable('ingredients', {
  // Связь с категорией
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => ingredientCategories.id),
  externalId: text('external_id').unique().notNull(), // "Якорь" для ингредиента
  primaryName: text('primary_name'),
  names: jsonb('names').notNull(),
  // Многоязычные поля
  aliases: jsonb('aliases'), // Псевдонимы тоже могут быть многоязычными

  // Дополнительные поля из вашей логики
  isActive: boolean('is_active').default(true),
  nutritionalData: jsonb('nutritional_data'), // Пищевая ценность в формате JSON

  // Временные метки
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastSyncAt: timestamp('last_sync_at'),
});
