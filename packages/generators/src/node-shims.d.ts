declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
}

declare module 'node:path' {
  const path: {
    join(...paths: string[]): string;
    dirname(path: string): string;
  };

  export default path;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:test' {
  type TestFunction = (name: string, fn: () => void | Promise<void>) => void;
  const test: TestFunction;
  export default test;
}

declare module 'node:assert/strict' {
  const assert: {
    deepEqual(actual: unknown, expected: unknown): void;
    equal(actual: unknown, expected: unknown): void;
    match(actual: string, expected: RegExp): void;
  };

  export default assert;
}
