// Just what the tests use from Node (no @types/node in this project).
declare module 'node:fs' {
  export function readFileSync(path: string): { readUInt32BE(offset: number): number };
}
