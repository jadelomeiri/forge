# Forge — Conventions

Forge uses convention over configuration.

## Structure

app/
config/
db/
public/
tests/
.forge/

## app/

app/models/
app/controllers/
app/services/
app/views/
app/policies/
app/jobs/
app/components/

## Models

app/models/post.model.ts

export const Post

Singular name.

## Controllers

app/controllers/posts.controller.ts

export class PostsController

Plural name.

Actions:

index
show
new
create
edit
update
delete

## Views

app/views/posts/

index.html
show.html
new.html
edit.html
_form.html

layouts/

app.html
auth.html

## Routes

GET /posts
GET /posts/new
POST /posts
GET /posts/:id
GET /posts/:id/edit
POST /posts/:id/update
POST /posts/:id/delete

Names:

posts.index
posts.show
posts.new
posts.create
posts.edit
posts.update
posts.delete

## Policy

app/policies/post.policy.ts

## Services

app/services/

Optional.

## Jobs

app/jobs/

## Components

app/components/

## Config

config/app.ts
config/routes.ts
config/auth.ts
config/forge.ts

## DB

db/schema.prisma
db/migrations/
db/seeds.ts

## Tests

tests/unit/
tests/integration/
tests/e2e/

## Manifest

.forge/manifest.json

Must contain:

models
controllers
routes
views
conventions

## Naming rules

model: post.model.ts
controller: posts.controller.ts
policy: post.policy.ts

views folder plural

export names PascalCase

## Guardrails

prefer explicit
prefer shallow
prefer readable
prefer boring
prefer convention