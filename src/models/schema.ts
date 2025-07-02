import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  varchar,
  timestamp,
  decimal,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ingredientCategories = pgTable('ingredient_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
});

export const ingredients = pgTable('ingredients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => ingredientCategories.id),
});

export const recipes = pgTable('recipes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  prepTime: integer('prep_time'), // in minutes
  servings: integer('servings'),
  difficulty: text('difficulty'),
  imageUrl: text('image_url'),
  instructions: jsonb('instructions'), // array of steps
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const recipeIngredients = pgTable('recipe_ingredients', {
  id: serial('id').primaryKey(),
  recipeId: integer('recipe_id').references(() => recipes.id),
  ingredientId: integer('ingredient_id').references(() => ingredients.id),
  amount: text('amount'), // e.g., "2 cups", "1 tbsp"
  required: boolean('required').default(true),
});

export const savedRecipes = pgTable('saved_recipes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  recipeId: integer('recipe_id').references(() => recipes.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const ingredientCategoriesRelations = relations(
  ingredientCategories,
  ({ many }) => ({
    ingredients: many(ingredients),
  })
);

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  category: one(ingredientCategories, {
    fields: [ingredients.categoryId],
    references: [ingredientCategories.id],
  }),
  recipeIngredients: many(recipeIngredients),
}));

export const recipesRelations = relations(recipes, ({ many }) => ({
  recipeIngredients: many(recipeIngredients),
  savedRecipes: many(savedRecipes),
}));

export const recipeIngredientsRelations = relations(
  recipeIngredients,
  ({ one }) => ({
    recipe: one(recipes, {
      fields: [recipeIngredients.recipeId],
      references: [recipes.id],
    }),
    ingredient: one(ingredients, {
      fields: [recipeIngredients.ingredientId],
      references: [ingredients.id],
    }),
  })
);

export const savedRecipesRelations = relations(savedRecipes, ({ one }) => ({
  user: one(users, {
    fields: [savedRecipes.userId],
    references: [users.id],
  }),
  recipe: one(recipes, {
    fields: [savedRecipes.recipeId],
    references: [recipes.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  savedRecipes: many(savedRecipes),
}));

// Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const insertIngredientCategorySchema =
  createInsertSchema(ingredientCategories);
export const insertIngredientSchema = createInsertSchema(ingredients);
export const insertRecipeSchema = createInsertSchema(recipes);
export const insertRecipeIngredientSchema =
  createInsertSchema(recipeIngredients);
export const insertSavedRecipeSchema = createInsertSchema(savedRecipes);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type IngredientCategory = typeof ingredientCategories.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type SavedRecipe = typeof savedRecipes.$inferSelect;

// Extended types for API responses
export type RecipeWithIngredients = Recipe & {
  recipeIngredients: (RecipeIngredient & {
    ingredient: Ingredient;
  })[];
};

export type IngredientWithCategory = Ingredient & {
  category: IngredientCategory;
};
