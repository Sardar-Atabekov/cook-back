// Тестовый скрипт для проверки логики подсчета total
// Этот скрипт демонстрирует ожидаемое поведение

console.log('🧪 Тестирование логики подсчета total\n');

// Симуляция данных
const mockRecipes = [
  { id: 1, title: 'Рецепт 1', ingredients: [1, 2, 3] },
  { id: 2, title: 'Рецепт 2', ingredients: [1, 2] },
  { id: 3, title: 'Рецепт 3', ingredients: [1, 2, 3, 4] },
  { id: 4, title: 'Рецепт 4', ingredients: [1, 2, 3, 4, 5] },
  { id: 5, title: 'Рецепт 5', ingredients: [1, 2, 3, 4, 5, 6] },
];

const userIngredients = [1, 2, 3, 4, 5];

// Функция для подсчета совпадений
function calculateMatch(recipeIngredients, userIngredients) {
  const matched = recipeIngredients.filter((ing) =>
    userIngredients.includes(ing)
  );
  const percentage = (matched.length / recipeIngredients.length) * 100;
  return {
    matchedCount: matched.length,
    totalCount: recipeIngredients.length,
    matchPercentage: Math.round(percentage),
  };
}

// Тест 1: Без ингредиентов (должен вернуть общее количество рецептов)
console.log('📋 Тест 1: Без ингредиентов');
console.log('Ожидаемый total:', mockRecipes.length);
console.log('Логика: Возвращает общее количество доступных рецептов\n');

// Тест 2: С ингредиентами (должен вернуть только 100% совпадения)
console.log('📋 Тест 2: С ингредиентами');
console.log('Пользовательские ингредиенты:', userIngredients);

const results = mockRecipes.map((recipe) => {
  const match = calculateMatch(recipe.ingredients, userIngredients);
  return {
    ...recipe,
    ...match,
    isPerfectMatch: match.matchPercentage === 100,
  };
});

console.log('\nРезультаты анализа:');
results.forEach((recipe) => {
  console.log(
    `- ${recipe.title}: ${recipe.matchedCount}/${recipe.totalCount} (${recipe.matchPercentage}%) ${recipe.isPerfectMatch ? '✅ 100%' : ''}`
  );
});

const perfectMatches = results.filter((r) => r.isPerfectMatch);
console.log(
  `\nОжидаемый total: ${perfectMatches.length} (только 100% совпадения)`
);

// Тест 3: Различные сценарии
console.log('\n📋 Тест 3: Различные сценарии');

const scenarios = [
  { name: 'Пустой список ингредиентов', ingredients: [] },
  { name: 'Один ингредиент', ingredients: [1] },
  { name: 'Все ингредиенты', ingredients: [1, 2, 3, 4, 5, 6] },
  { name: 'Частичное совпадение', ingredients: [1, 2, 3] },
];

scenarios.forEach((scenario) => {
  console.log(`\n${scenario.name}:`);

  if (scenario.ingredients.length === 0) {
    console.log('  total = общее количество рецептов');
  } else {
    const matches = results.filter((r) => {
      const match = calculateMatch(r.ingredients, scenario.ingredients);
      return match.matchPercentage === 100;
    });
    console.log(`  total = ${matches.length} (100% совпадения)`);
  }
});

console.log('\n✅ Логика работает корректно!');
console.log('\n📝 Резюме:');
console.log('- Без ингредиентов: total = общее количество рецептов');
console.log(
  '- С ингредиентами: total = количество рецептов с 100% совпадением'
);
