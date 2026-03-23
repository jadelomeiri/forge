declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module 'node:path' {
  const path: {
    resolve(...paths: string[]): string;
    join(...paths: string[]): string;
    dirname(path: string): string;
  };

  export default path;
}

declare const process: {
  cwd(): string;
};
