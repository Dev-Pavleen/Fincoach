import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const serverEnvironmentFile = path.join(serverDirectory, '.env');

export function loadEnvironment(filePath = serverEnvironmentFile) {
  return dotenv.config({ path: filePath });
}
