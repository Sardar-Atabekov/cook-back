import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  prepTime: integer('prep_time'),
  servings: integer('servings'),
  difficulty: text('difficulty'),
  imageUrl: text('image_url'),
  instructions: jsonb('instructions'),
  sourceUrl: text('source_url'),
  supercookId: text('supercook_id').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});
