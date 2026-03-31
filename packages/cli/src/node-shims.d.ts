declare module 'node:child_process' {
  export function spawn(
    command: string,
    args?: string[],
    options?: { cwd?: string; stdio?: 'inherit' },
  ): {
    on(event: 'error', listener: (error: Error) => void): void;
    on(event: 'exit', listener: (code: number | null) => void): void;
  };
}

declare module 'node:fs/promises' {
  export function access(path: string): Promise<void>;
  export function lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function readlink(path: string): Promise<string>;
  export function realpath(path: string): Promise<string>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function symlink(target: string, path: string, type?: 'dir'): Promise<void>;
}

declare module 'node:path' {
  const path: {
    dirname(path: string): string;
    join(...paths: string[]): string;
    resolve(...paths: string[]): string;
  };

  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:test' {
  export default function test(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  const assert: {
    equal(actual: unknown, expected: unknown): void;
    deepEqual(actual: unknown, expected: unknown): void;
    match(value: string, expression: RegExp): void;
  };

  export default assert;
}
