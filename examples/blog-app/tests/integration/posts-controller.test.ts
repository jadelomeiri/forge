import test from 'node:test';
import assert from 'node:assert/strict';

import { ForgeApp, registerRoutesFromConfig } from '@forge/runtime';
import { PostsController } from '../../app/controllers/posts.controller.ts';
import { routes } from '../../config/routes.ts';

test('PostsController handles the scaffold happy path and validation errors', async () => {
  const app = new ForgeApp({ rootDir: process.cwd() });
  await registerRoutesFromConfig(app, routes, { controllers: { PostsController } });
  const server = await app.boot({ port: 0 });

  try {
    const indexResponse = await fetch(`http://${server.host}:${server.port}/posts`);
    const newResponse = await fetch(`http://${server.host}:${server.port}/posts/new`);
    const invalidCreateResponse = await fetch(`http://${server.host}:${server.port}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title: '', body: 'body draft' }),
    });
    const showResponse = await fetch(`http://${server.host}:${server.port}/posts/42`);
    const validCreateResponse = await fetch(`http://${server.host}:${server.port}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      redirect: "manual",
      body: new URLSearchParams({
      title: 'title value',
      body: 'body value',
      published: 'true',
      }),
    });

    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /New Post/);

    assert.equal(newResponse.status, 200);
    assert.match(await newResponse.text(), /Create Post/);

    assert.equal(invalidCreateResponse.status, 422);
    assert.match(await invalidCreateResponse.text(), /Title is required./);

    assert.equal(showResponse.status, 200);
    assert.match(await showResponse.text(), /ID: 42/);

    assert.equal(validCreateResponse.status, 302);
    assert.equal(validCreateResponse.headers.get('location'), '/posts');
  } finally {
    await server.close();
  }
});
