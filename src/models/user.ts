import {
  pgTable,
  serial,
  varchar,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  lastLogin: timestamp('last_login', { mode: 'date' }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  isLocked: boolean('is_locked').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});
