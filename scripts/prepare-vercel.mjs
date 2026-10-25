import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtClient = path.join(root, 'client', 'dist');
const publicDirectory = path.join(root, 'public');

await mkdir(publicDirectory, { recursive: true });
await cp(builtClient, publicDirectory, { recursive: true, force: true });
console.log('Prepared Vercel public assets from client/dist.');
