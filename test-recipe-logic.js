// Простой тест для проверки логики фильтрации рецептов
const testRecipes = [
  { id: 1, matchPercentage: 100, matchedCount: 3, totalCount: 3 },
  { id: 2, matchPercentage: 80, matchedCount: 4, totalCount: 5 },
  { id: 3, matchPercentage: 0, matchedCount: 0, totalCount: 3 },
  { id: 4, matchPercentage: null, matchedCount: 0, totalCount: 0 },
  { id: 5, matchPercentage: 100, matchedCount: 2, totalCount: 2 },
];

// Фильтрация рецептов с null совпадением
const filteredRecipes = testRecipes.filter(
  (recipe) =>
    recipe.matchPercentage !== null &&
    recipe.matchPercentage > 0 &&
    recipe.matchedCount > 0
);

console.log('Исходные рецепты:', testRecipes.length);
console.log('Отфильтрованные рецепты:', filteredRecipes.length);
console.log(
  'Рецепты с 100% совпадением:',
  filteredRecipes.filter((r) => r.matchPercentage === 100).length
);

// Проверяем логику подсчета
const recipesWith100Percent = testRecipes.filter(
  (recipe) =>
    recipe.matchPercentage === 100 &&
    recipe.matchedCount === recipe.totalCount &&
    recipe.totalCount > 0
);

console.log(
  'Рецепты с 100% совпадением (правильная логика):',
  recipesWith100Percent.length
);

// Проверяем пагинацию
const limit = 2;
const offset = 0;
const hasMore = filteredRecipes.length > limit;
const limitedRecipes = filteredRecipes.slice(offset, offset + limit);

console.log('Пагинация:');
console.log('- Всего отфильтрованных:', filteredRecipes.length);
console.log('- Лимит:', limit);
console.log('- Смещение:', offset);
console.log('- Есть еще:', hasMore);
console.log('- Возвращено:', limitedRecipes.length);
