import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

export type ForgeHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ForgeRouteParams = Record<string, string>;
export type ForgeQueryParams = Record<string, string | string[]>;
export type ForgeRequestBody = Record<string, string | string[]>;
export type ForgeViewData = Record<string, ForgeTemplateValue>;
export type ForgeTemplateValue = string | number | boolean | null | undefined;

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

export function createApp(options: ForgeViewRendererOptions = {}): ForgeApp {
  return new ForgeApp(options);
}

export function route(definition: ForgeRouteDefinition): ForgeRouteDefinition {
  return definition;
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
    const port = options.port ?? 3000;
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
      server.listen(port, host, () => resolve());
    });

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
      const rawBody = chunks.join('');

      if (rawBody.length === 0) {
        resolve({});
        return;
      }

      resolve(readSearchParams(new URLSearchParams(rawBody)));
    });

    nodeRequest.on('error', (error) => reject(error));
  });
}

function readSearchParams(searchParams: URLSearchParams): Record<string, string | string[]> {
  const values: Record<string, string | string[]> = {};

  for (const [key, value] of searchParams.entries()) {
    const currentValue = values[key];

    if (currentValue === undefined) {
      values[key] = value;
      continue;
    }

    values[key] = Array.isArray(currentValue) ? [...currentValue, value] : [currentValue, value];
  }

  return values;
}

function matchRoute(
  routes: ForgeRegisteredRoute[],
  method: string,
  pathValue: string,
): { definition: ForgeRouteDefinition; params: ForgeRouteParams } | undefined {
  const requestSegments = splitPath(pathValue);

  for (const routeValue of routes) {
    if (routeValue.definition.method !== method) {
      continue;
    }

    if (routeValue.segments.length !== requestSegments.length) {
      continue;
    }

    const params: ForgeRouteParams = {};
    let matches = true;

    for (let index = 0; index < routeValue.segments.length; index += 1) {
      const routeSegment = routeValue.segments[index];
      const requestSegment = requestSegments[index];

      if (routeSegment.startsWith(':')) {
        params[routeSegment.slice(1)] = requestSegment;
        continue;
      }

      if (routeSegment !== requestSegment) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        definition: routeValue.definition,
        params,
      };
    }
  }

  return undefined;
}

function splitPath(pathValue: string): string[] {
  if (pathValue === '/' || pathValue.length === 0) {
    return [];
  }

  return pathValue.split('/').filter((segment) => segment.length > 0);
}

function writeNodeResponse(
  nodeResponse: import('node:http').ServerResponse,
  response: ForgeResponseData,
): void {
  nodeResponse.statusCode = response.status;

  for (const [name, value] of Object.entries(response.headers)) {
    nodeResponse.setHeader(name, value);
  }

  nodeResponse.end(response.body);
}

function normalizeViewName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function resolveLayoutName(layout: string): string {
  const normalizedLayout = normalizeViewName(layout);
  return normalizedLayout.startsWith('layouts/') ? normalizedLayout : `layouts/${normalizedLayout}`;
}

function resolvePartialView(parentView: string, partialName: string): string {
  const normalizedParent = normalizeViewName(parentView);
  const normalizedPartial = normalizeViewName(partialName);
  const directoryName = path.posix.dirname(normalizedParent);

  if (normalizedPartial.includes('/')) {
    return prefixPartialFilename(normalizedPartial);
  }

  if (directoryName === '.') {
    return prefixPartialFilename(normalizedPartial);
  }

  return `${directoryName}/${prefixPartialFilename(normalizedPartial)}`;
}

function prefixPartialFilename(value: string): string {
  const segments = value.split('/');
  const fileName = segments.pop() ?? value;
  const partialFileName = fileName.startsWith('_') ? fileName : `_${fileName}`;

  return [...segments, partialFileName].join('/');
}

function stringifyTemplateValue(value: ForgeTemplateValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

async function replaceAsync(
  value: string,
  pattern: RegExp,
  replacer: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = Array.from(value.matchAll(pattern));

  if (matches.length === 0) {
    return value;
  }

  const replacements = await Promise.all(
    matches.map((match) => replacer(...match.map((entry) => entry ?? ''))),
  );

  let nextValue = value;

  for (let index = 0; index < matches.length; index += 1) {
    const matchedText = matches[index][0];
    nextValue = nextValue.replace(matchedText, replacements[index]);
  }

  return nextValue;
}
