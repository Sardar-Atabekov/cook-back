import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  numeric,
} from 'drizzle-orm/pg-core';

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  prepTime: numeric('prep_time'),
  rating: integer('rating'),
  difficulty: text('difficulty'),
  imageUrl: text('image_url'),
  instructions: jsonb('instructions'),
  lang: text('lang'),
  sourceUrl: text('source_url'),
  supercookId: text('supercook_id').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
  viewed: integer('viewed').default(0),
});
