import { db } from '../storage/db';
import {
  mealTypes as mealTypesTable,
  diets as dietsTable,
  kitchens as kitchensTable,
} from '../models/schema/tags';

const mealTypeTags = [
  {
    type: 'meal_type',
    tag: 'ptag_appetizer and snacks',
    slug: 'appetizer',
    name: 'Appetizer and Snacks',
  },
  {
    type: 'meal_type',
    tag: 'ptag_breakfast and brunch',
    slug: 'breakfast',
    name: 'Breakfast and Brunch',
  },
  { type: 'meal_type', tag: 'ptag_lunch', slug: 'lunch', name: 'Lunch' },
  {
    type: 'meal_type',
    tag: 'ptag_baked goods',
    slug: 'baked-goods',
    name: 'Baked Goods',
  },
  {
    type: 'meal_type',
    tag: 'ptag_desserts',
    slug: 'desserts',
    name: 'Desserts',
  },
  { type: 'meal_type', tag: 'ptag_salads', slug: 'salads', name: 'Salads' },
  { type: 'meal_type', tag: 'ptag_main dish', slug: 'main', name: 'Main Dish' },
  { type: 'meal_type', tag: 'ptag_side dish', slug: 'side', name: 'Side Dish' },
  {
    type: 'meal_type',
    tag: 'ptag_soups and stews',
    slug: 'soups',
    name: 'Soups and Stews',
  },
  {
    type: 'meal_type',
    tag: 'ptag_special occasions',
    slug: 'special',
    name: 'Special Occasions',
  },
];

const dietTags = [
  { type: 'diet', tag: 'diet_vegan', slug: 'vegan', name: 'Vegan' },
  {
    type: 'diet',
    tag: 'diet_vegetarian',
    slug: 'vegetarian',
    name: 'Vegetarian',
  },
  {
    type: 'diet',
    tag: 'diet_lactose free',
    slug: 'lactose-free',
    name: 'Lactose Free',
  },
  {
    type: 'diet',
    tag: 'diet_gluten free',
    slug: 'gluten-free',
    name: 'Gluten Free',
  },
];

const kitchenTags = [
  {
    type: 'kitchen',
    tag: 'ctag_african',
    slug: 'african',
    name: 'Африканская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_american',
    slug: 'american',
    name: 'Американская',
  },
  { type: 'kitchen', tag: 'ctag_asian', slug: 'asian', name: 'Азиатская' },
  {
    type: 'kitchen',
    tag: 'ctag_australian',
    slug: 'australian',
    name: 'Австралийская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_brazilian',
    slug: 'brazilian',
    name: 'Бразильская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_caribbean',
    slug: 'caribbean',
    name: 'Карибская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_creole and cajun',
    slug: 'creole-cajun',
    name: 'Креольская и Каджунская',
  },
  { type: 'kitchen', tag: 'ctag_chinese', slug: 'chinese', name: 'Китайская' },
  { type: 'kitchen', tag: 'ctag_french', slug: 'french', name: 'Французская' },
  { type: 'kitchen', tag: 'ctag_english', slug: 'british', name: 'Британская' },
  { type: 'kitchen', tag: 'ctag_greek', slug: 'greek', name: 'Греческая' },
  { type: 'kitchen', tag: 'ctag_indian', slug: 'indian', name: 'Индийская' },
  {
    type: 'kitchen',
    tag: 'ctag_italian',
    slug: 'italian',
    name: 'Итальянская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_latin american',
    slug: 'latin-american',
    name: 'Латиноамериканская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_mediterranean',
    slug: 'mediterranean',
    name: 'Средиземноморская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_middle eastern',
    slug: 'middle-eastern',
    name: 'Средневосточная',
  },
  {
    type: 'kitchen',
    tag: 'ctag_russian and ukranian',
    slug: 'russian-ukrainian',
    name: 'Русская и Украинская',
  },
  {
    type: 'kitchen',
    tag: 'ctag_scottish',
    slug: 'scottish',
    name: 'Шотландская',
  },
  { type: 'kitchen', tag: 'ctag_spanish', slug: 'spanish', name: 'Испанская' },
  { type: 'kitchen', tag: 'ctag_thai', slug: 'thai', name: 'Тайская' },
  { type: 'kitchen', tag: 'ctag_turkish', slug: 'turkish', name: 'Турецкая' },
];

export async function seedTags() {
  await db.insert(mealTypesTable).values(mealTypeTags).onConflictDoNothing();
  await db.insert(dietsTable).values(dietTags).onConflictDoNothing();
  await db.insert(kitchensTable).values(kitchenTags).onConflictDoNothing();

  console.log('✅ Tags успешно импортированы');
}
