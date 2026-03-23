import test from 'node:test';
import assert from 'node:assert/strict';

import { defineModel, field } from '../dist/index.js';

test('defineModel stores field metadata for primitive fields', () => {
  const Post = defineModel('Post', {
    title: field.string({ required: true }),
    body: field.text(),
    published: field.boolean({ default: false }),
    views: field.integer({ default: 0 }),
    rating: field.decimal({ default: 4.5 }),
    publishedOn: field.date(),
  });

  assert.deepEqual(Post.metadata, {
    kind: 'model',
    name: 'Post',
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'body', type: 'text', required: false },
      { name: 'published', type: 'boolean', required: false, default: false },
      { name: 'views', type: 'integer', required: false, default: 0 },
      { name: 'rating', type: 'decimal', required: false, default: 4.5 },
      { name: 'publishedOn', type: 'date', required: false },
    ],
  });
});

test('field builders keep explicit metadata on field definitions', () => {
  const title = field.string({ required: true });
  const body = field.text({ default: 'Draft body' });

  assert.deepEqual(title, {
    kind: 'field',
    type: 'string',
    required: true,
  });

  assert.deepEqual(body, {
    kind: 'field',
    type: 'text',
    required: false,
    default: 'Draft body',
  });
});
