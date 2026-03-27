import test from 'node:test';
import assert from 'node:assert/strict';

import { routes } from '../../config/routes.ts';

test('home route is registered', () => {
  assert.deepEqual(routes[0], {
    name: 'home.index',
    method: 'GET',
    path: '/',
    view: 'home/index',
  });
});
