# Tickr

Tickr is a NestJS REST API for managing users, multi-tenant organizations, and
project issues. It provides JWT authentication, organization membership and
role-based access, projects, sequentially numbered issues, and issue comments.
PostgreSQL is accessed through Prisma.

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
  its creator the administrator role. Users must verify their email address
  before they can sign in.
- Email verification, verification email resend, and password recovery.
- JWT authentication and switching between organizations the user belongs to.
- Organization creation and member management with role-based permissions.
- Project management with tenant-scoped project keys.
- Issue tracking with per-project sequential numbers, status, priority, and
  optional assignees.
- Comments on issues, with editing restricted to their authors and deletion
  available to authors or organization administrators.
- Tenant isolation across projects, issues, and comments.
- Validation messages in English or Spanish, selected using the `?lang=`
  parameter or the `Accept-Language` header.

## API overview

Interactive API documentation is available at [`/api`](http://localhost:3000/api)
when the server is running.

| Route | Description |
| --- | --- |
| `/auth` | Register, verify email, sign in, recover a password, get the current user, and switch organizations. |
| `/tenants` | Create organizations and manage current-organization members. |
| `/projects` | Create, list, update, and delete projects. |
| `/issues` | Create, list, update, and delete issues. |
| `/issues/:issueId/comments` | List and create comments on an issue. |
| `/comments/:id` | Update or delete a comment. |

Protected routes require a bearer access token. Project creation, updates, and
deletion are restricted to organization administrators. Organization members
can create and update issues; issue deletion is restricted to administrators.

## Commands

| Command | Description |
| --- | --- |
| `pnpm start` | Start the application. |
| `pnpm start:dev` | Start the application in watch mode. |
| `pnpm start:debug` | Start in watch mode with the debugger. |
| `pnpm build` | Compile the application into `dist/`. |
| `pnpm start:prod` | Run the compiled application. |
| `pnpm format` | Format TypeScript files in `src/` and `test/`. |
| `pnpm lint` | Lint the code in `src/` and `test/`. |
| `pnpm test` | Run unit tests. |
| `pnpm test:watch` | Run tests in watch mode. |
| `pnpm test:e2e` | Run end-to-end tests. |
| `pnpm test:cov` | Run tests with coverage. |

End-to-end tests require a separate, disposable PostgreSQL database. Set
`DATABASE_URL_TEST` to point to that database before running them; the test
environment applies migrations to it.

## Docker

Build the production image from the repository root:

```bash
docker build -t tickr .
```

Run the container with `DATABASE_URL` and `JWT_SECRET` configured in its
environment. The database host in `DATABASE_URL` must be reachable from inside
the container. The API listens on port `3000`; publish that port when starting
the container.

## Project structure

- `src/auth/`: registration, sign-in, JWT, and role-based authorization.
- `src/tenant/`: organizations and member management.
- `src/project/`: project endpoints and services.
- `src/issue/`: issue endpoints, validation, and issue numbering.
- `src/comment/`: issue comment endpoints and services.
- `src/prisma/`: Prisma and PostgreSQL integration.
- `src/i18n/`: English and Spanish translations.
- `prisma/`: database schema and migrations.
- `test/`: unit, integration, and end-to-end tests.