# Blog App (Phase 1 validation example)

This app is the Task 16 reference for validating the current Forge Phase 1 flow end to end.

## Validated demo flow

Run from the repository root (`/workspace/forge`):

1. **Create app**

   ```bash
   cd examples
   node ../packages/cli/dist/index.js new blog-app
   ```

2. **Generate model**

   ```bash
   cd blog-app
   node ../../packages/cli/dist/index.js generate model Post title:string body:text published:boolean
   ```

3. **Generate scaffold**

   ```bash
   node ../../packages/cli/dist/index.js generate scaffold Post
   ```

4. **Migrate**

   ```bash
   node ../../packages/cli/dist/index.js migrate
   ```

5. **Run dev server**

   ```bash
   node ../../packages/cli/dist/index.js dev
   ```

6. **Create, edit, and delete a post (current behavior)**

   Current Phase 1 behavior is request/response and validation-oriented, not persisted storage yet:

   - `POST /posts` with valid values returns `302` to `/posts`.
   - `POST /posts/:id/update` with valid values returns `302` to `/posts/:id`.
   - `POST /posts/:id/delete` returns `302` to `/posts`.
   - `GET /posts/:id` renders the route param id and does not read/write a database row.

7. **Run explain commands**

   ```bash
   node ../../packages/cli/dist/index.js explain model Post
   node ../../packages/cli/dist/index.js explain route /posts/1
   ```

## What “create/edit/delete” means right now

This example intentionally documents current rough edges instead of hiding them:

- No persistence layer is wired into scaffold actions yet.
- “Create”, “edit”, and “delete” currently prove route wiring, form handling, validation, and redirects.
- The flow is still useful for validating Phase 1 conventions and explainability.

## Environment note for migration validation

- The example keeps the normal generated migration contract (`prisma db push --schema db/schema.prisma`).
- In restricted environments where installing npm dependencies is blocked, step 4 may fail until `prisma` is available.
