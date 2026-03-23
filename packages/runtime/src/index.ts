import { createServer } from 'node:http';

export type ForgeHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ForgeRouteParams = Record<string, string>;
export type ForgeQueryParams = Record<string, string | string[]>;
export type ForgeRequestBody = Record<string, string | string[]>;

export type ForgeRenderHtmlInput = {
  body: string;
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
  redirect(input: string | ForgeRedirectInput): ForgeResponseData;
};

export function createApp(): ForgeApp {
  return new ForgeApp();
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

export class ForgeApp {
  private readonly routes: ForgeRegisteredRoute[] = [];

  registerRoute(definition: ForgeRouteDefinition): ForgeApp {
    this.routes.push(createRegisteredRoute(definition));
    return this;
  }

  get(path: string, controller: ForgeControllerHandler, name?: string): ForgeApp {
    return this.registerRoute({ method: 'GET', path, controller, ...(name ? { name } : {}) });
  }

  post(path: string, controller: ForgeControllerHandler, name?: string): ForgeApp {
    return this.registerRoute({ method: 'POST', path, controller, ...(name ? { name } : {}) });
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

      const responseHelpers = createResponseHelpers();
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

type ForgeRegisteredRoute = {
  definition: ForgeRouteDefinition;
  segments: string[];
};

function createRegisteredRoute(definition: ForgeRouteDefinition): ForgeRegisteredRoute {
  return {
    definition,
    segments: splitPath(definition.path),
  };
}

function createResponseHelpers(): ForgeResponseHelpers {
  return {
    html(input) {
      return typeof input === 'string' ? createHtmlResponse({ body: input }) : createHtmlResponse(input);
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
  path: string,
): { definition: ForgeRouteDefinition; params: ForgeRouteParams } | undefined {
  const requestSegments = splitPath(path);

  for (const route of routes) {
    if (route.definition.method !== method) {
      continue;
    }

    if (route.segments.length !== requestSegments.length) {
      continue;
    }

    const params: ForgeRouteParams = {};
    let matches = true;

    for (let index = 0; index < route.segments.length; index += 1) {
      const routeSegment = route.segments[index];
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
        definition: route.definition,
        params,
      };
    }
  }

  return undefined;
}

function splitPath(path: string): string[] {
  if (path === '/' || path.length === 0) {
    return [];
  }

  return path.split('/').filter((segment) => segment.length > 0);
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
