import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { recipes } from './recipes';

export const mealTypes = pgTable('meal_types', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  tag: text('tag').notNull().unique(), // оригинальный tag с сайта
  slug: text('slug').notNull().unique(), // для фильтрации
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const diets = pgTable('diets', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(),
  tag: text('tag').notNull().unique(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const kitchens = pgTable('kitchens', {
  id: serial('id').primaryKey(),
  tag: text('tag').notNull().unique(),
  type: text('type').notNull(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const recipeMealTypes = pgTable('recipe_meal_types', {
  recipeId: integer('recipe_id').references(() => recipes.id),
  mealTypeId: integer('meal_type_id').references(() => mealTypes.id),
});

export const recipeDiets = pgTable('recipe_diets', {
  recipeId: integer('recipe_id').references(() => recipes.id),
  dietId: integer('diet_id').references(() => diets.id),
});

export const recipeKitchens = pgTable('recipe_kitchens', {
  recipeId: integer('recipe_id').references(() => recipes.id),
  kitchenId: integer('kitchen_id').references(() => kitchens.id),
});
