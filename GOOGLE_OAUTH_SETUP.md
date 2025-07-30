# Настройка Google OAuth

## 1. Создание проекта в Google Cloud Console

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google+ API и Google OAuth2 API

## 2. Настройка OAuth 2.0

1. В меню слева выберите "APIs & Services" > "Credentials"
2. Нажмите "Create Credentials" > "OAuth 2.0 Client IDs"
3. Выберите тип приложения "Web application"
4. Добавьте авторизованные URI перенаправления:
   - `http://localhost:5000/api/auth/google/callback` (для разработки)
   - `https://yourdomain.com/api/auth/google/callback` (для продакшена)
5. Сохраните Client ID и Client Secret

## 3. Переменные окружения

Добавьте в ваш `.env` файл:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

## 4. API Endpoints

После настройки будут доступны следующие эндпоинты:

- `GET /api/auth/google` - Инициализация Google OAuth
- `GET /api/auth/google/callback` - Callback от Google OAuth
- `GET /api/auth/failure` - Обработка ошибок аутентификации

## 5. Использование

1. Пользователь переходит по ссылке `/api/auth/google`
2. Происходит перенаправление на Google для авторизации
3. После успешной авторизации Google перенаправляет на `/api/auth/google/callback`
4. Сервер создает или находит пользователя и возвращает JWT токен

## 6. Ответ сервера

При успешной авторизации сервер возвращает:

```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "User Name",
    "avatar": "https://example.com/avatar.jpg",
    "authProvider": "google",
    "lastLogin": "2024-01-01T00:00:00.000Z"
  },
  "expiresIn": "7d"
}
```

## 7. Безопасность

- Всегда используйте HTTPS в продакшене
- Храните секреты в переменных окружения
- Валидируйте данные пользователя
- Используйте secure cookies для сессий
- Ограничьте доступ к API только авторизованным пользователям
