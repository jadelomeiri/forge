declare const process: {
  cwd(): string;
};

declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;

  export const posix: {
    dirname(path: string): string;
  };
}

declare module 'node:url' {
  export function pathToFileURL(path: string): URL;
}

declare module 'node:http' {
  export type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

  export interface IncomingMessage {
    headers: IncomingHttpHeaders;
    method?: string;
    url?: string;
    on(event: 'data', listener: (chunk: string | Uint8Array) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): this;
    end(chunk?: string): this;
  }

  export interface ServerAddressInfo {
    port: number;
  }

  export interface Server {
    listen(port: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
    listen(port: number, hostname?: string, listeningListener?: () => void): this;
    listen(port: number, listeningListener?: () => void): this;
    close(callback?: (error?: Error) => void): this;
    address(): string | ServerAddressInfo | null;
  }

  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
  ): Server;
}
