import test from 'node:test';
import assert from 'node:assert/strict';

import { Post } from '../../app/models/post.model.ts';
import { validateResourceInput } from '@forge/runtime';

test('Post validation rejects blank title', () => {
  const result = validateResourceInput(Post, { title: '' });

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.title, ['Title is required.']);
});

test('Post validation applies the current scaffold defaults', () => {
  const result = validateResourceInput(Post, {
    title: 'Example title',
  });

  assert.deepEqual(result, {
    valid: true,
    values: {
      title: 'Example title',
      published: false,
    },
    errors: {},
  });
});
