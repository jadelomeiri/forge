# Blog App (Phase 1 reference)

This app is the concrete reference for the current Forge Phase 1 workflow.

Use it to compare generated output and behavior, especially around current CRUD/persistence rough edges.

## Validated flow

From repository root (`/workspace/forge`):

1. Build packages:

   ```bash
   npm run build
   ```

2. Create app:

   ```bash
   cd examples
   node ../packages/cli/dist/index.js new blog-app
   ```

3. Generate model:

   ```bash
   cd blog-app
   node ../../packages/cli/dist/index.js generate model Post title:string body:text published:boolean
   ```

4. Generate scaffold:

   ```bash
   node ../../packages/cli/dist/index.js generate scaffold Post
   ```

5. Migrate:

   ```bash
   node ../../packages/cli/dist/index.js migrate
   ```

6. Run dev server:

   ```bash
   node ../../packages/cli/dist/index.js dev
   ```

7. Run explain commands:

   ```bash
   node ../../packages/cli/dist/index.js explain model Post
   node ../../packages/cli/dist/index.js explain route /posts/1
   ```

## Current behavior notes (important)

Phase 1 currently proves routing, forms, validation, and redirects.

- `POST /posts` with valid input returns `302` to `/posts`.
- `POST /posts/:id/update` with valid input returns `302` to `/posts/:id`.
- `POST /posts/:id/delete` returns `302` to `/posts`.
- `GET /posts/:id` renders the route param id.

Persistence-backed read/write in scaffold actions is not fully wired yet. Treat this app as a Phase 1 conventions/runtime-flow reference, not a finished data persistence implementation.

## Migration environment note

This example keeps the generated migration contract (`prisma db push --schema db/schema.prisma`).
If your environment cannot install npm dependencies, migration may fail until `prisma` is available.
