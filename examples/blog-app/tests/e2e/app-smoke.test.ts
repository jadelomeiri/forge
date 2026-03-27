import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../setup.ts';

test('starter test context is available', () => {
  assert.equal(createTestContext().status, 'ready');
});
