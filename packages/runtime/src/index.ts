import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ForgeModelMetadata, ForgeModelFieldMetadata } from '@forge/core';

export type ForgeHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ForgeRouteParams = Record<string, string>;
export type ForgeQueryParams = Record<string, string | string[]>;
export type ForgeRequestBody = Record<string, string | string[]>;
export type ForgeTemplateValue = string | number | boolean | null | undefined;
export type ForgeViewData = Record<string, ForgeTemplateValue>;

export type ForgeRenderHtmlInput = {
  body: string;
  status?: number;
  headers?: Record<string, string>;
};

export type ForgeRenderViewInput = {
  view: string;
  data?: ForgeViewData;
  layout?: string | false;
  status?: number;
  headers?: Record<string, string>;
};

export type ForgeRedirectInput = {
  location: string;
  status?: number;
  headers?: Record<string, string>;
};

export type ForgeResponseData = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type ForgeControllerContext = {
  request: ForgeRequest;
  response: ForgeResponseHelpers;
};

export type ForgeControllerHandler = (
  context: ForgeControllerContext,
) => ForgeResponseData | Promise<ForgeResponseData>;

export type ForgeRouteDefinition = {
  method: ForgeHttpMethod;
  path: string;
  controller: ForgeControllerHandler;
  name?: string;
};

export type ForgeRoutesConfigEntry = {
  name: string;
  method: ForgeHttpMethod;
  path: string;
  controller?: string;
  action?: string;
  view?: string;
};

export type ForgeControllerClass = new () => Record<string, unknown>;

export type ForgeControllerResolver = {
  resolve(route: ForgeRoutesConfigEntry): Promise<ForgeControllerHandler>;
};

export type ForgeControllerRegistration = Record<string, ForgeControllerClass>;

export type ForgeRegisterRoutesOptions = {
  rootDir?: string;
  controllerResolver?: ForgeControllerResolver;
  controllers?: ForgeControllerRegistration;
};

export type ForgeBootOptions = {
  port?: number;
  host?: string;
};

export type ForgeBootResult = {
  host: string;
  port: number;
  close(): Promise<void>;
};

export type ForgeRequest = {
  method: ForgeHttpMethod | string;
  path: string;
  url: URL;
  params: ForgeRouteParams;
  query: ForgeQueryParams;
  body: ForgeRequestBody;
  headers: Record<string, string | string[] | undefined>;
  header(name: string): string | string[] | undefined;
  input(name: string): string | string[] | undefined;
};

export type ForgeResponseHelpers = {
  html(input: string | ForgeRenderHtmlInput): ForgeResponseData;
  render(view: string, data?: ForgeViewData, options?: ForgeRenderResponseOptions): Promise<ForgeResponseData>;
  redirect(input: string | ForgeRedirectInput): ForgeResponseData;
};

export type ForgeViewRendererOptions = {
  rootDir?: string;
  viewsDir?: string;
  defaultLayout?: string | false;
};

export type ForgeRenderOptions = {
  data?: ForgeViewData;
  layout?: string | false;
};

export type ForgeRenderResponseOptions = ForgeRenderOptions & {
  status?: number;
  headers?: Record<string, string>;
};

export type ForgeValidationErrorMap = Record<string, string[]>;

export type ForgeValidationResult = {
  valid: boolean;
  values: Record<string, string | boolean | number>;
  errors: ForgeValidationErrorMap;
};

export function createApp(options: ForgeViewRendererOptions = {}): ForgeApp {
  return new ForgeApp(options);
}

export function route(definition: ForgeRouteDefinition): ForgeRouteDefinition {
  return definition;
}

export async function registerRoutesFromConfig(
  app: ForgeApp,
  routes: readonly ForgeRoutesConfigEntry[],
  options: ForgeRegisterRoutesOptions = {},
): Promise<ForgeApp> {
  const controllerResolver = options.controllerResolver ?? createControllerResolver(options);

  for (const routeEntry of routes) {
    const handler = await createRouteHandler(routeEntry, controllerResolver);
    app.registerRoute({
      method: routeEntry.method,
      path: routeEntry.path,
      name: routeEntry.name,
      controller: handler,
    });
  }

  return app;
}

export async function loadRoutesConfig(rootDir = process.cwd()): Promise<readonly ForgeRoutesConfigEntry[]> {
  const routesModulePath = await resolveModulePath(rootDir, 'config/routes');
  const moduleValue = await import(pathToFileURL(routesModulePath).href);
  const routes = moduleValue.routes;

  if (!Array.isArray(routes)) {
    throw new Error(
      [
        'Invalid routes module export.',
        `Path: ${routesModulePath}`,
        'Expected convention: export const routes = [ ... ].',
        'Try: define and export a routes array from config/routes.ts.',
      ].join('\n'),
    );
  }

  return routes as readonly ForgeRoutesConfigEntry[];
}

export function createControllerResolver(options: ForgeRegisterRoutesOptions = {}): ForgeControllerResolver {
  const rootDir = options.rootDir ?? process.cwd();
  const registeredControllers = options.controllers ?? {};

  return {
    async resolve(routeEntry) {
      if (!routeEntry.controller || !routeEntry.action) {
        throw new Error([
          `Route "${routeEntry.name}" is missing controller or action metadata.`,
          `Path: config/routes.ts`,
          'Expected convention: route entries set both controller and action for controller-backed routes.',
          `Try: { name: '${routeEntry.name}', method: '${routeEntry.method}', path: '${routeEntry.path}', controller: 'PostsController', action: 'index' }`,
        ].join('\n'));
      }

      const ControllerClass = registeredControllers[routeEntry.controller] ?? await loadControllerClass(rootDir, routeEntry.controller);
      const controllerInstance = new ControllerClass();
      const actionValue = controllerInstance[routeEntry.action];

      if (typeof actionValue !== 'function') {
        throw new Error([
          `Controller action not found: ${routeEntry.controller}#${routeEntry.action}.`,
          `Path: app/controllers/${toKebabCase(routeEntry.controller.replace(/Controller$/, ''))}.controller.ts`,
          'Expected convention: controller class defines a method matching route.action.',
          `Try: add "${routeEntry.action}(...)" to ${routeEntry.controller}.`,
        ].join('\n'));
      }

      return async (context) => actionValue.call(controllerInstance, context) as Promise<ForgeResponseData>;
    },
  };
}

export function html(body: string, status = 200): ForgeResponseData {
  return createHtmlResponse({ body, status });
}

export function redirect(location: string, status = 302): ForgeResponseData {
  return createRedirectResponse({ location, status });
}

export async function renderView(
  view: string,
  options: ForgeViewRendererOptions & ForgeRenderOptions = {},
): Promise<string> {
  return createViewRenderer(options).render(view, options.data, options.layout);
}

export function createViewRenderer(options: ForgeViewRendererOptions = {}): ForgeViewRenderer {
  return new ForgeViewRenderer(options);
}

export function validateResourceInput(
  model: { metadata: ForgeModelMetadata },
  input: ForgeRequestBody,
): ForgeValidationResult {
  const values: Record<string, string | boolean | number> = {};
  const errors: ForgeValidationErrorMap = {};

  for (const field of model.metadata.fields) {
    const rawValue = input[field.name];
    const normalizedValue = normalizeFieldValue(field, rawValue);

    if (normalizedValue === undefined) {
      if (field.default !== undefined) {
        values[field.name] = field.default;
      } else if (field.type === 'boolean') {
        values[field.name] = false;
      }
    } else {
      values[field.name] = normalizedValue;
    }

    const valueForValidation = values[field.name];

    if (field.required && isBlankValidationValue(field, valueForValidation)) {
      errors[field.name] = [`${humanizeFieldName(field.name)} is required.`];
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    values,
    errors,
  };
}

export class ForgeApp {
  private readonly routes: ForgeRegisteredRoute[] = [];

  private readonly viewRenderer: ForgeViewRenderer;

  constructor(options: ForgeViewRendererOptions = {}) {
    this.viewRenderer = createViewRenderer(options);
  }

  registerRoute(definition: ForgeRouteDefinition): ForgeApp {
    this.routes.push(createRegisteredRoute(definition));
    return this;
  }

  get(pathValue: string, controller: ForgeControllerHandler, name?: string): ForgeApp {
    return this.registerRoute({ method: 'GET', path: pathValue, controller, ...(name ? { name } : {}) });
  }

  post(pathValue: string, controller: ForgeControllerHandler, name?: string): ForgeApp {
    return this.registerRoute({ method: 'POST', path: pathValue, controller, ...(name ? { name } : {}) });
  }

  routesList(): ForgeRouteDefinition[] {
    return this.routes.map(({ definition }) => ({ ...definition }));
  }

  async boot(options: ForgeBootOptions = {}): Promise<ForgeBootResult> {
    const host = options.host ?? '127.0.0.1';
    const requestedPort = options.port ?? 3000;
    const server = createServer(async (nodeRequest, nodeResponse) => {
      const request = await createForgeRequest(nodeRequest);
      const matchedRoute = matchRoute(this.routes, request.method, request.path);

      if (!matchedRoute) {
        writeNodeResponse(nodeResponse, createHtmlResponse({ body: 'Not Found', status: 404 }));
        return;
      }

      const responseHelpers = createResponseHelpers(this.viewRenderer);
      const controllerResponse = await matchedRoute.definition.controller({
        request: {
          ...request,
          params: matchedRoute.params,
        },
        response: responseHelpers,
      });

      writeNodeResponse(nodeResponse, controllerResponse);
    });

    await new Promise<void>((resolve) => {
      server.listen(requestedPort, host, () => resolve());
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : requestedPort;

    return {
      host,
      port,
      close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
          server.close((error?: Error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      },
    };
  }
}

export class ForgeViewRenderer {
  private readonly viewsRoot: string;

  private readonly defaultLayout: string | false;

  constructor(options: ForgeViewRendererOptions = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    this.viewsRoot = path.resolve(rootDir, options.viewsDir ?? 'app/views');
    this.defaultLayout = options.defaultLayout ?? 'app';
  }

  async render(view: string, data: ForgeViewData = {}, layout: string | false = this.defaultLayout): Promise<string> {
    const template = await this.readTemplate(view);
    const content = await this.renderTemplate(template, view, data);

    if (layout === false) {
      return content;
    }

    const layoutTemplate = await this.readTemplate(resolveLayoutName(layout));
    return this.renderTemplate(layoutTemplate, resolveLayoutName(layout), {
      ...data,
      content,
    });
  }

  private async renderTemplate(template: string, view: string, data: ForgeViewData): Promise<string> {
    const withPartials = await replaceAsync(template, PARTIAL_PATTERN, async (_match, partialName: string) => {
      const partialView = resolvePartialView(view, partialName);
      const partialTemplate = await this.readTemplate(partialView);
      return this.renderTemplate(partialTemplate, partialView, data);
    });

    return withPartials.replace(VARIABLE_PATTERN, (_match, variableName: string) => stringifyTemplateValue(data[variableName]));
  }

  private async readTemplate(name: string): Promise<string> {
    const templatePath = path.join(this.viewsRoot, `${normalizeViewName(name)}.html`);
    return readFile(templatePath, 'utf8');
  }
}

type ForgeRegisteredRoute = {
  definition: ForgeRouteDefinition;
  segments: string[];
};

const PARTIAL_PATTERN = /{{>\s*([A-Za-z0-9_/-]+)\s*}}/g;
const VARIABLE_PATTERN = /{{\s*([A-Za-z0-9_]+)\s*}}/g;

function createRegisteredRoute(definition: ForgeRouteDefinition): ForgeRegisteredRoute {
  return {
    definition,
    segments: splitPath(definition.path),
  };
}

async function createRouteHandler(
  routeEntry: ForgeRoutesConfigEntry,
  controllerResolver: ForgeControllerResolver,
): Promise<ForgeControllerHandler> {
  if (routeEntry.view) {
    return async ({ response }) => response.render(routeEntry.view as string);
  }

  return controllerResolver.resolve(routeEntry);
}

function createResponseHelpers(viewRenderer: ForgeViewRenderer): ForgeResponseHelpers {
  return {
    html(input) {
      return typeof input === 'string' ? createHtmlResponse({ body: input }) : createHtmlResponse(input);
    },
    async render(view, data, options) {
      const body = await viewRenderer.render(view, data ?? options?.data ?? {}, options?.layout);
      return createHtmlResponse({
        body,
        status: options?.status,
        headers: options?.headers,
      });
    },
    redirect(input) {
      return typeof input === 'string'
        ? createRedirectResponse({ location: input })
        : createRedirectResponse(input);
    },
  };
}

function createHtmlResponse(input: ForgeRenderHtmlInput): ForgeResponseData {
  return {
    status: input.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...(input.headers ?? {}),
    },
    body: input.body,
  };
}

function createRedirectResponse(input: ForgeRedirectInput): ForgeResponseData {
  return {
    status: input.status ?? 302,
    headers: {
      location: input.location,
      ...(input.headers ?? {}),
    },
    body: '',
  };
}

async function createForgeRequest(nodeRequest: import('node:http').IncomingMessage): Promise<ForgeRequest> {
  const method = (nodeRequest.method ?? 'GET').toUpperCase();
  const url = new URL(nodeRequest.url ?? '/', 'http://forge.local');
  const body = await readRequestBody(nodeRequest);
  const query = readSearchParams(url.searchParams);

  return {
    method,
    path: url.pathname,
    url,
    params: {},
    query,
    body,
    headers: nodeRequest.headers,
    header(name: string) {
      return nodeRequest.headers[name.toLowerCase()];
    },
    input(name: string) {
      if (body[name] !== undefined) {
        return body[name];
      }

      return query[name];
    },
  };
}

function readRequestBody(nodeRequest: import('node:http').IncomingMessage): Promise<ForgeRequestBody> {
  return new Promise<ForgeRequestBody>((resolve, reject) => {
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    nodeRequest.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
    });

    nodeRequest.on('end', () => {
      const remainder = decoder.decode();
      if (remainder) {
        chunks.push(remainder);
      }

      const bodyText = chunks.join('').trim();
      if (bodyText.length === 0) {
        resolve({});
        return;
      }

      resolve(parseFormEncodedBody(bodyText));
    });

    nodeRequest.on('error', (error) => reject(error));
  });
}

function parseFormEncodedBody(bodyText: string): ForgeRequestBody {
  const params = new URLSearchParams(bodyText);
  return readSearchParams(params);
}

function readSearchParams(params: URLSearchParams): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};

  for (const [key, value] of params.entries()) {
    const currentValue = output[key];

    if (currentValue === undefined) {
      output[key] = value;
      continue;
    }

    output[key] = Array.isArray(currentValue) ? [...currentValue, value] : [currentValue, value];
  }

  return output;
}

function matchRoute(
  routes: ForgeRegisteredRoute[],
  method: string,
  requestPath: string,
): { definition: ForgeRouteDefinition; params: ForgeRouteParams } | undefined {
  const requestSegments = splitPath(requestPath);

  for (const routeEntry of routes) {
    if (routeEntry.definition.method !== method.toUpperCase()) {
      continue;
    }

    if (routeEntry.segments.length !== requestSegments.length) {
      continue;
    }

    const params: ForgeRouteParams = {};
    let matched = true;

    for (let index = 0; index < routeEntry.segments.length; index += 1) {
      const routeSegment = routeEntry.segments[index];
      const requestSegment = requestSegments[index];

      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = requestSegment;
        continue;
      }

      if (routeSegment !== requestSegment) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return {
        definition: routeEntry.definition,
        params,
      };
    }
  }

  return undefined;
}

function splitPath(pathValue: string): string[] {
  return pathValue.split('/').filter((segment) => segment.length > 0);
}

function writeNodeResponse(nodeResponse: import('node:http').ServerResponse, responseData: ForgeResponseData): void {
  nodeResponse.statusCode = responseData.status;

  for (const [name, value] of Object.entries(responseData.headers)) {
    nodeResponse.setHeader(name, value);
  }

  nodeResponse.end(responseData.body);
}

function normalizeViewName(name: string): string {
  return name.replace(/\\/g, '/').replace(/\.html$/, '');
}

function resolveLayoutName(layout: string): string {
  const normalizedLayout = normalizeViewName(layout);
  return normalizedLayout.startsWith('layouts/') ? normalizedLayout : `layouts/${normalizedLayout}`;
}

function resolvePartialView(view: string, partialName: string): string {
  const normalizedPartial = normalizeViewName(partialName);

  if (normalizedPartial.includes('/')) {
    const segments = normalizedPartial.split('/');
    const lastSegment = segments[segments.length - 1];
    segments[segments.length - 1] = lastSegment.startsWith('_') ? lastSegment : `_${lastSegment}`;
    return segments.join('/');
  }

  const directory = path.posix.dirname(normalizeViewName(view));
  const partialBaseName = normalizedPartial.startsWith('_') ? normalizedPartial : `_${normalizedPartial}`;
  return directory === '.' ? partialBaseName : `${directory}/${partialBaseName}`;
}

async function resolveModulePath(rootDir: string, baseModulePath: string): Promise<string> {
  const extensions = ['.ts', '.js', '.mjs', '.cjs'];

  for (const extension of extensions) {
    const candidate = path.join(rootDir, `${baseModulePath}${extension}`);

    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
  }

  throw new Error([
    `Could not find module "${baseModulePath}" in project root.`,
    `Path: ${path.join(rootDir, baseModulePath)}.(ts|js|mjs|cjs)`,
    'Expected convention: file exists with one of the supported extensions.',
    'Try: create the missing file or fix rootDir when booting the app.',
  ].join('\n'));
}

async function loadControllerClass(rootDir: string, controllerName: string): Promise<ForgeControllerClass> {
  const controllerFileName = `${toKebabCase(controllerName.replace(/Controller$/, ''))}.controller`;
  const controllerModulePath = await resolveModulePath(rootDir, `app/controllers/${controllerFileName}`);
  const moduleValue = await import(pathToFileURL(controllerModulePath).href);
  const ControllerClass = moduleValue[controllerName];

  if (typeof ControllerClass !== 'function') {
    throw new Error([
      'Controller export is missing or invalid.',
      `Path: ${controllerModulePath}`,
      `Expected convention: export class ${controllerName} { ... }`,
      `Try: rename the exported controller class to ${controllerName}.`,
    ].join('\n'));
  }

  return ControllerClass as ForgeControllerClass;
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function isMissingFileError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function stringifyTemplateValue(value: ForgeTemplateValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

async function replaceAsync(
  input: string,
  pattern: RegExp,
  replacement: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = Array.from(input.matchAll(pattern));

  if (matches.length === 0) {
    return input;
  }

  const replacements = await Promise.all(matches.map((match) => replacement(...match)));
  let replacementIndex = 0;

  return input.replace(pattern, () => replacements[replacementIndex++] ?? '');
}

function normalizeFieldValue(
  field: ForgeModelFieldMetadata,
  rawValue: string | string[] | undefined,
): string | boolean | number | undefined {
  const firstValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (field.type === 'boolean') {
    if (firstValue === undefined) {
      return undefined;
    }

    return firstValue === 'true' || firstValue === 'on' || firstValue === '1';
  }

  if (firstValue === undefined) {
    return undefined;
  }

  return firstValue;
}

function isBlankValidationValue(
  field: ForgeModelFieldMetadata,
  value: string | boolean | number | undefined,
): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (field.type === 'boolean') {
    return value !== true;
  }

  return String(value).trim().length === 0;
}

function humanizeFieldName(value: string): string {
  const withSpaces = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();

  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}
