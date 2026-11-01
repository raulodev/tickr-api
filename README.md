# Tickr

REST API built with NestJS for managing user accounts and multi-user
organizations. It includes JWT-based registration and sign-in, organization
selection, member management, and `ADMIN` and `MEMBER` roles. Data is stored in
PostgreSQL using Prisma.

## Requirements

- Node.js 24
- pnpm
- PostgreSQL

## Getting started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file in the project root and configure the PostgreSQL
   connection and JWT secret:

   ```dotenv
   DATABASE_URL="postgresql://USUARIO:CONTRASENA@localhost:5432/tickr?schema=public"
   JWT_SECRET="replace-with-a-secure-secret"
   ```

   Replace the username and password, and adjust the host or database name if
   needed for your environment. Do not share or commit your `.env` file.

3. Generate the Prisma client and apply database migrations:

   ```bash
   pnpm exec prisma generate --config prisma7.config.ts
   pnpm exec prisma migrate dev --config prisma7.config.ts
   ```

4. Start the API in development mode:

   ```bash
   pnpm start:dev
   ```

The application listens on port `3000` by default. Set the `PORT` environment
variable to use a different port. Interactive API documentation is available at
[`/api`](http://localhost:3000/api).

## Features

- Registration and sign-in; registration creates an organization and assigns
  its creator the administrator role.
- JWT authentication and switching between organizations the user belongs to.
- Organization creation and member management with role-based permissions.
- Validation messages in English or Spanish, selected using the `?lang=`
  parameter or the `Accept-Language` header.

## Commands

| Command | Description |
| --- | --- |
| `pnpm start` | Start the application. |
| `pnpm start:dev` | Start the application in watch mode. |
| `pnpm start:debug` | Start in watch mode with the debugger. |
| `pnpm build` | Compile the application into `dist/`. |
| `pnpm start:prod` | Run the compiled application. |
| `pnpm lint` | Lint the code in `src/` and `test/`. |
| `pnpm test` | Run unit tests. |
| `pnpm test:e2e` | Run end-to-end tests. |
| `pnpm test:cov` | Run tests with coverage. |

End-to-end tests require a separate, disposable PostgreSQL database. Set
`DATABASE_URL_TEST` to point to that database before running them; the test
environment applies migrations to it.

## Project structure

- `src/auth/`: registration, sign-in, JWT, and role-based authorization.
- `src/tenant/`: organizations and member management.
- `src/users/`: user operations.
- `src/prisma/`: Prisma and PostgreSQL integration.
- `src/i18n/`: English and Spanish translations.
- `prisma/`: database schema and migrations.
- `test/`: unit, integration, and end-to-end tests.