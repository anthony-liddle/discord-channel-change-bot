import fs from 'fs/promises';
import { THEMES_PATH } from './themes';
import { STATE_PATH } from './state';

export interface RuntimeFile {
  name: string;
  path: string;
  content: string | null;
  error: string | null;
}

/**
 * themes.json and state.json are runtime files on hosting the admin team has no
 * shell access to, and they exist nowhere else. Reading them out through an
 * ephemeral Discord attachment is the only way to see what is actually in them,
 * and the same attachment is what makes a hosting migration possible.
 */
const RUNTIME_FILES: { name: string; path: string }[] = [
  { name: 'themes.json', path: THEMES_PATH },
  { name: 'state.json', path: STATE_PATH },
];

export async function readRuntimeFiles(): Promise<RuntimeFile[]> {
  return Promise.all(
    RUNTIME_FILES.map(async ({ name, path }) => {
      try {
        const content = await fs.readFile(path, 'utf8');
        return { name, path, content, error: null };
      } catch (err) {
        return {
          name,
          path,
          content: null,
          error: (err as Error).message,
        };
      }
    }),
  );
}
