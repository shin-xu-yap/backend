## Project setup

```bash
# install packages
$ npm install

# start docker
$ docker-compose up -d

# generate prisma client
$ npx prisma generate

# start development server with watch mode
$ npm run start:dev
```

## Tech stack used
- Backend: NestJS
- Database: PostgreSQL, Prisma ORM
- Frontend (if applicable): ReactJS

## Thought Process and Design Decisions
- Prisma ORM: Type-safe queries, automatic migrations, and faster developer workflow.
- PostgreSQL: Reliable relational database with strong support for transactions.
- Docker Compose: Simplifies setup for both app and database in development.
- Architecture: Feature-domain organization (controllers, services, repositories) following clean architecture principles.
- Validation: Zod schemas ensure consistent and safe data handling.

## Known Issues / Limitations
- Some API endpoints may not handle edge cases fully.
- Docker setup is primarily for development; production deployment requires extra configuration (secrets, SSL, scaling).