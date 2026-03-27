import test from 'node:test';
import assert from 'node:assert/strict';

import { ForgeApp, registerRoutesFromConfig } from '@forge/runtime';
import { PostsController } from '../../app/controllers/posts.controller.ts';
import { routes } from '../../config/routes.ts';

test('posts scaffold smoke test', async () => {
  const app = new ForgeApp({ rootDir: process.cwd() });
  await registerRoutesFromConfig(app, routes, { controllers: { PostsController } });
  const server = await app.boot({ port: 0 });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/posts`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Posts/);
  } finally {
    await server.close();
  }
});
