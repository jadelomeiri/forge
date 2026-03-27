# Forge (Phase 1)

Forge is a convention-first full-stack TypeScript framework for building readable business apps quickly.

Phase 1 focuses on proving a clear end-to-end flow:

1. create an app
2. generate a model
3. generate scaffold files
4. run migrate
5. run the dev server
6. inspect behavior with explain commands

This repository is intentionally early and practical. It favors explicit files and predictable conventions over framework magic.

## What Forge is (right now)

Forge currently gives you:

- a CLI with a small command set
- generated model/scaffold code you can read directly
- server-rendered HTML views
- resource routing conventions
- request validation and error display wiring
- manifest tracking in `.forge/manifest.json`
- explain commands for model and route visibility

Forge currently does **not** provide a fully wired persistence-backed CRUD runtime yet. See [Current limitations](#current-limitations-phase-1-honest-status).

## Core conventions

Forge follows convention over configuration. The conventions are the API.

### App structure

```txt
app/
config/
db/
public/
tests/
.forge/
```

### Naming

- Models are singular: `app/models/post.model.ts`
- Controllers are plural: `app/controllers/posts.controller.ts`
- Views are in plural folders: `app/views/posts/`

### Resource routes (scaffold)

Scaffold generation follows this route/action shape:

- `GET /posts` → `index`
- `GET /posts/new` → `new`
- `POST /posts` → `create`
- `GET /posts/:id` → `show`
- `GET /posts/:id/edit` → `edit`
- `POST /posts/:id/update` → `update`
- `POST /posts/:id/delete` → `delete`

Named routes follow `resource.action` (example: `posts.show`).

### Manifest

Forge tracks generated app metadata in `.forge/manifest.json`, including:

- models
- controllers
- routes
- views
- convention metadata

## Quick start (10-minute Phase 1 flow)

These steps match current repository behavior and are intentionally explicit.

### 0) Build the workspace once

From repo root:

```bash
npm run build
```

### 1) Create an app

```bash
node packages/cli/dist/index.js new demo-app
cd demo-app
```

### 2) Generate a model

```bash
node ../packages/cli/dist/index.js generate model Post title:string body:text published:boolean
```

This creates/updates:

- `app/models/post.model.ts`
- `db/schema.prisma`
- `.forge/manifest.json`

### 3) Generate scaffold

```bash
node ../packages/cli/dist/index.js generate scaffold Post
```

This generates:

- `app/controllers/posts.controller.ts`
- `app/views/posts/index.html`
- `app/views/posts/show.html`
- `app/views/posts/new.html`
- `app/views/posts/edit.html`
- `app/views/posts/_form.html`
- `config/routes.ts` entries
- tests under `tests/unit`, `tests/integration`, `tests/e2e`
- manifest updates

### 4) Run migrations

```bash
node ../packages/cli/dist/index.js migrate
```

`forge migrate` runs `npm run db:migrate` in the app directory. By convention this uses:

```bash
prisma db push --schema db/schema.prisma
```

### 5) Run dev server

```bash
node ../packages/cli/dist/index.js dev
```

Default address: `http://127.0.0.1:3000`

### 6) Use explain commands

```bash
node ../packages/cli/dist/index.js explain model Post
node ../packages/cli/dist/index.js explain route /posts/1
```

Use these to inspect what Forge believes is wired based on manifest + conventions.

## Command reference (Phase 1)

### `forge new <app-name>`

Creates a new Forge app skeleton with conventional folders, config files, initial layout/view, tests, Prisma schema, and manifest.

### `forge generate model <ModelName> [field:type ...]`

Creates a model file, appends model schema in `db/schema.prisma`, and updates manifest metadata.

Supported field types:

- `string`
- `text`
- `boolean`
- `integer`
- `decimal`
- `date`

### `forge generate scaffold <ModelName>`

Generates controller/views/tests/route entries/manifest entries for a conventional resource flow.

### `forge migrate`

Runs the app's `db:migrate` npm script after validating required files and script presence.

### `forge dev`

Boots the Forge runtime, loads routes from `config/routes.ts`, registers them, and starts the local server.

### `forge explain model <ModelName>`

Explains model fields, defaults/required validations (when present), scaffold linkage, and route names from manifest + model source.

### `forge explain route <route-name-or-path>`

Explains resolved route method/path/controller action/controller file/view.

## Current limitations (Phase 1 honest status)

Important: be careful interpreting “CRUD works” at this stage.

Current scaffolded controllers primarily prove route wiring, form handling, validation, and redirects.

- Create/update/delete actions currently redirect on success.
- Generated `show` uses the route parameter id in rendering.
- A persistence-backed read/write flow is not fully wired into scaffold actions yet.
- This means behavior is useful for validating conventions and request/response flow, but not yet equivalent to a production CRUD data layer.

Also out of Phase 1 scope:

- auth
- jobs
- admin
- email
- storage
- roles
- plugins
- SPA/realtime modes
- deploy tooling

## Reference example

Use `examples/blog-app` as the canonical Phase 1 reference app in this repository.

- Guide: `examples/blog-app/README.md`
- Includes generated model, scaffolded posts resource, schema, routes, tests, and realistic caveats about current persistence behavior.

If you are new to Forge, follow the repo Quick Start above first, then compare your generated app to `examples/blog-app`.
