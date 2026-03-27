import { defineModel, field } from '@forge/core';

export const Post = defineModel('Post', {
  title: field.string({ required: true }),
  body: field.text(),
  published: field.boolean({ default: false }),
});
