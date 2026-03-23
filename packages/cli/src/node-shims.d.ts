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
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}

declare module 'node:path' {
  const path: {
    join(...paths: string[]): string;
  };

  export default path;
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
