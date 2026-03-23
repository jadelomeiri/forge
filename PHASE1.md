# Forge — Phase 1

Goal:

Prove the core experience.

create app
generate model
generate scaffold
migrate
run
CRUD works
explain works

## Required commands

forge new
forge generate model
forge generate scaffold
forge migrate
forge dev
forge explain model
forge explain route

## Model types

string
text
boolean
integer
decimal
date

## Scaffold must generate

controller
views
tests
routes
manifest

Views:

index.html
show.html
new.html
edit.html
_form.html

Actions:

index
show
new
create
edit
update
delete

## Runtime

must support

routing
html render
form submit
validation
redirect

## Validation

required
default
error display

## Manifest

.forge/manifest.json

must track

models
controllers
routes
views

## Explain

forge explain model Post

forge explain route /posts/1

## Not in phase1

auth
jobs
admin
email
storage
roles
plugins
spa
realtime
api-only
deploy
codemods

## Done when

new app works
model works
scaffold works
migrate works
dev works
crud works
explain works
tests run