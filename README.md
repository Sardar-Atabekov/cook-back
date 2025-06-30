# Auth Fullstack App

## Description

This is a fullstack authentication app built with **React + Express + MongoDB** using JWT, secure password handling, and a modern UI.

---

## Features

- Registration and login via email and password
- Password hashing (scrypt)
- JWT authentication
- Account lockout after 100 failed login attempts
- Data validation on both server and client
- Modern UI with React, TailwindCSS, Radix UI
- API request logging
- SSR and HMR via Vite in development mode

---

## Quick Start

### 1. Clone the repository

```sh
git clone https://github.com/Sardar-Atabekov/auth.git
cd auth
```

### 2. Install dependencies

```sh
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root based on `.env.example`:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=userdb
JWT_SECRET=your_jwt_secret
```

### 4. Start server and client

```sh
npm run dev
```

- Server will be available at http://localhost:5000
- Client — at http://localhost:5000

---

## Project Structure

```
auth/
├── client/         # React app (frontend)
├── server/         # Express + MongoDB (backend)
├── .env.example    # Example environment variables
├── package.json
└── README.md
```

---

## Main API

- `POST /api/user/user` — registration
- `POST /api/user/auth` — login
- Response:
  ```json
  {
    "token": "JWT...",
    "user": {
      "id": "...",
      "email": "...",
      "lastLogin": "2025-06-12T09:44:50.964Z"
    },
    "expiresIn": "7d"
  }
  ```

---

## Technologies

- **Frontend:** React 18, TailwindCSS, Radix UI, Wouter
- **Backend:** Express, Mongoose, JWT, dotenv
- **Dev:** TypeScript, ESLint, Prettier, Husky, Vite

---

## Scripts

- `npm run dev` — start in development mode
- `npm run lint` — lint the code
- `npm run format` — auto-format code
- `npm run type-check` — type checking

---

## Security

- Passwords are stored only in hashed form
- JWT is stored on the client (for production, httpOnly cookies are recommended)
- Brute-force protection: account lockout after 100 failed attempts

---

## Contacts

Author: Sardar Atabekov  
License: MIT
