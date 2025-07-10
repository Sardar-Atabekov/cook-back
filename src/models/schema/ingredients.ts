
import {
  pgTable,
  serial,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const ingredients = pgTable(
  'ingredients',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    language: text('language').notNull(),
    isActive: boolean('is_active').default(true),
    aliases: jsonb('aliases'),
    nutritionalData: jsonb('nutritional_data'),
    lastSyncAt: timestamp('last_sync_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    unq_name_lang: uniqueIndex('unique_ingredient_name_lang').on(
      table.name,
      table.language
    ),
  })
);
