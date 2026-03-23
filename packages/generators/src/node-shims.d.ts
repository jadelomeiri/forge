declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding?: string): Promise<void>;
  export function symlink(target: string, path: string, type?: 'dir' | 'file' | 'junction'): Promise<void>;
}

declare module 'node:path' {
  const path: {
    join(...paths: string[]): string;
    dirname(path: string): string;
    resolve(...paths: string[]): string;
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

declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string | undefined> },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
}

declare module 'node:util' {
  export function promisify(
    fn: (
      file: string,
      args: readonly string[],
      options: { cwd?: string; env?: Record<string, string | undefined> },
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => void,
  ): (
    file: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string | undefined> },
  ) => Promise<{ stdout: string; stderr: string }>;
}
