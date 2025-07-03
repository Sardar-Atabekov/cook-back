// Замените serial на integer, чтобы мы могли задавать ID вручную
import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  serial,
} from 'drizzle-orm/pg-core';

export const ingredientCategories = pgTable('ingredient_categories', {
   id: serial('id').primaryKey(),
  // Уникальный порядковый номер из API. Будет нашим "якорем".
  externalId: integer('external_id').unique().notNull(), 
  names: jsonb('names').notNull(),
  isActive: boolean('is_active').default(true),
  primaryName: text('primary_name').unique(), // Уникальное "якорное" имя (напр., на английском)
  descriptions: jsonb('descriptions'),
  parentId: integer('parent_id'),
  level: integer('level').default(0),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
