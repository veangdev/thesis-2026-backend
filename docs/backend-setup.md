# Backend Project Setup Requirements

Act as a senior Backend API engineer with more than 10 years of professional experience. Prepare this backend project to a production-quality standard before it is pushed to GitHub and before other developers are invited to collaborate.

Your goal is to create a clean, maintainable, scalable, and team-ready backend foundation.

## Required Deliverables

### 1. Backend Foundation

* Set up a complete backend project structure that is ready to build and expose APIs.
* Create a clear modular architecture for future features.
* Separate responsibilities properly, such as controllers, services, modules, DTOs, entities/models, repositories, guards, middleware, and utilities.
* Avoid unnecessary or duplicated code.

### 2. Core Backend Setup

* Configure environment variables using `.env` files.
* Provide an `.env.example` file with all required variables.
* Add centralized configuration management.
* Add global error handling and consistent API response formats.
* Add request validation and data transformation.
* Add logging suitable for development and production environments.
* Add API versioning, for example: `/api/v1`.

### 3. Authentication Foundation

* Implement the foundation for authentication and authorization.
* Include user registration, login, password hashing, JWT access tokens, and refresh tokens if appropriate.
* Add protected routes using authentication guards or middleware.
* Prepare role-based authorization so it can be extended later.
* Ensure sensitive fields such as passwords are never returned in API responses.

### 4. Docker Setup

* Dockerize the entire application.
* Include a `Dockerfile` and `docker-compose.yml`.
* Include required services such as the backend API and database.
* Ensure a new developer can run the project with only a few commands:

```bash
cp .env.example .env
yarn install
docker compose up --build
```

* Confirm that the API, database, migrations, and Swagger documentation work correctly through Docker.

### 5. Swagger / OpenAPI Documentation

* Configure Swagger/OpenAPI documentation end-to-end.
* Document all API routes, request DTOs, response DTOs, authentication requirements, and error responses.
* Make Swagger available through a clear route, such as:

```text
/docs
```

* Ensure protected endpoints can be tested using JWT Bearer authentication inside Swagger.

### 6. TypeScript Quality

* Ensure the project has zero TypeScript errors.
* Ensure the project compiles successfully.
* Enable strict TypeScript settings where appropriate.
* Avoid using `any` unless there is a valid and documented reason.
* Run and fix all linting, formatting, compilation, and type-checking issues before completion.

### 7. Package Manager

* Use Yarn only.
* Do not use npm or pnpm.
* Include a valid `yarn.lock` file.
* Ensure all scripts work with Yarn.

Required commands should include:

```bash
yarn dev
yarn build
yarn start
yarn lint
yarn format
yarn test
yarn test:e2e
yarn typecheck
```

### 8. Testing Setup

* Configure unit testing and end-to-end testing.
* Add tests for important modules, especially authentication, validation, protected routes, and error handling.
* Ensure tests can run in a clean environment.
* Add test coverage reporting if possible.
* Ensure all tests pass before the project is considered ready.

### 9. Code Quality and Project Conventions

* Follow consistent project conventions.
* Use ESLint and Prettier.
* Add pre-commit hooks using Husky and lint-staged.
* Enforce formatting, linting, and type checking before commits.
* Use meaningful naming conventions for files, classes, methods, variables, DTOs, and modules.
* Keep files focused and avoid overly large controllers or services.
* Avoid duplicated logic and dead code.

### 10. OOP and TypeScript Standards

* Apply Object-Oriented Programming principles appropriately.
* Use dependency injection.
* Use interfaces, abstract classes, enums, DTOs, and reusable base classes only where they improve maintainability.
* Follow SOLID principles where practical.
* Keep business logic inside services, not controllers.
* Keep controllers thin and focused on HTTP request/response handling.

### 11. GitHub Collaboration Readiness

Before the first push to GitHub, include:

* A complete `README.md`.
* Installation instructions.
* Environment setup instructions.
* Docker setup instructions.
* Database migration instructions.
* Testing instructions.
* Swagger documentation URL.
* Project architecture overview.
* API conventions.
* Git branching strategy.
* Pull request guidelines.
* Commit message convention.
* A `.gitignore` file.
* A `.env.example` file.

### 12. CI/CD Readiness

Prepare the project for CI/CD.

Create a GitHub Actions workflow that runs on pull requests and pushes to the main branch.

The workflow must run:

```bash
yarn install --frozen-lockfile
yarn lint
yarn typecheck
yarn test
yarn build
```

The pipeline must fail if linting, type checking, tests, or build steps fail.

## Final Verification Checklist

Before finishing, verify and report the result of each item:

* [ ] Project installs successfully using Yarn.
* [ ] Project runs successfully using Docker.
* [ ] Database connection works.
* [ ] Database migrations work.
* [ ] Swagger documentation is accessible.
* [ ] Authentication foundation works.
* [ ] Protected routes work.
* [ ] Linting passes.
* [ ] Type checking passes.
* [ ] TypeScript compilation passes.
* [ ] Unit tests pass.
* [ ] End-to-end tests pass.
* [ ] Docker build passes.
* [ ] GitHub Actions CI workflow is configured.
* [ ] README documentation is complete.
* [ ] No unnecessary, duplicate, or messy code remains.

Do not mark the project as complete until every checklist item has been verified.
