import test from 'node:test';
import assert from 'node:assert/strict';

import { appConfig } from '../../config/app.ts';

test('app config exposes a default layout', () => {
  assert.equal(appConfig.defaultLayout, 'app');
});
