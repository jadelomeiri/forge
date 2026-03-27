import type { ForgeControllerContext, ForgeValidationResult } from '@forge/runtime';
import { validateResourceInput } from '@forge/runtime';
import { Post } from '../models/post.model.ts';

export class PostsController {
  async index({ response }: ForgeControllerContext) {
    return response.render('posts/index', {
      pageTitle: 'Posts',
      heading: 'Posts',
      emptyMessage: 'No posts yet.',
      newPath: '/posts/new',
    });
  }

  async show({ request, response }: ForgeControllerContext) {
    const id = request.params.id ?? '';

    return response.render('posts/show', {
      pageTitle: 'Post',
      heading: 'Post',
      id,
      editPath: `/posts/${id}/edit`,
      deletePath: `/posts/${id}/delete`,
    });
  }

  async new({ response }: ForgeControllerContext) {
    return response.render('posts/new', this.buildFormData({
      pageTitle: 'New Post',
      heading: 'New Post',
      formAction: '/posts',
      submitLabel: 'Create Post',
    }));
  }

  async create({ request, response }: ForgeControllerContext) {
    const validation = validateResourceInput(Post, request.body);

    if (!validation.valid) {
      return response.render('posts/new', this.buildFormData({
        pageTitle: 'New Post',
        heading: 'New Post',
        formAction: '/posts',
        submitLabel: 'Create Post',
      }, validation), { status: 422 });
    }

    return response.redirect('/posts');
  }

  async edit({ request, response }: ForgeControllerContext) {
    const id = request.params.id ?? '';

    return response.render('posts/edit', this.buildFormData({
      pageTitle: 'Edit Post',
      heading: 'Edit Post',
      id,
      formAction: `/posts/${id}/update`,
      submitLabel: 'Update Post',
    }));
  }

  async update({ request, response }: ForgeControllerContext) {
    const id = request.params.id ?? '';
    const validation = validateResourceInput(Post, request.body);

    if (!validation.valid) {
      return response.render('posts/edit', this.buildFormData({
        pageTitle: 'Edit Post',
        heading: 'Edit Post',
        id,
        formAction: `/posts/${id}/update`,
        submitLabel: 'Update Post',
      }, validation), { status: 422 });
    }

    return response.redirect(`/posts/${id}`);
  }

  async delete({ response }: ForgeControllerContext) {
    return response.redirect('/posts');
  }

  private buildFormData(baseData: Record<string, string>, validation?: ForgeValidationResult) {
    const values = validation?.values ?? {};
    const errors = validation?.errors ?? {};

    return {
      ...baseData,
      errorsHeading: validation ? 'Please correct the errors below.' : '',
      errorsSummary: validation ? this.renderErrorsSummary(errors) : '',
      title: String(values.title ?? ''),
      titleError: errors.title?.[0] ?? '',
      body: String(values.body ?? ''),
      bodyError: errors.body?.[0] ?? '',
      publishedChecked: values.published === true ? 'checked' : '',
      publishedError: errors.published?.[0] ?? '',
    };
  }

  private renderErrorsSummary(errors: ForgeValidationResult['errors']) {
    const messages = Object.values(errors).flat();

    if (messages.length === 0) {
      return '';
    }

    return ['<ul>', ...messages.map((message) => `  <li>${message}</li>`), '</ul>'].join('\n');
  }
}
