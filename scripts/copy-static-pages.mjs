import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const pages = ['boyfriend-camera.html'];

await mkdir(join(rootDir, 'dist'), { recursive: true });

for (const page of pages) {
  await copyFile(join(rootDir, page), join(rootDir, 'dist', page));
}
