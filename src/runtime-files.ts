import fs from 'fs/promises';
import { THEMES_PATH } from './themes';
import { STATE_PATH } from './state';
import { CONFIG_PATH } from './config';

export interface RuntimeFile {
  name: string;
  path: string;
  content: string | null;
  error: string | null;
}

/**
 * themes.json, state.json and config.json are runtime files on hosting the
 * admin team has no shell access to, and they exist nowhere else. Reading them
 * out through an ephemeral Discord attachment is the only way to see what is
 * actually in them, and the same attachment is what makes a hosting migration
 * possible.
 */
const RUNTIME_FILES: { name: string; path: string }[] = [
  { name: 'themes.json', path: THEMES_PATH },
  { name: 'state.json', path: STATE_PATH },
  // config.json holds channel ids, a cron expression and a timezone. No
  // secrets: the bot token and client id come from the environment, never from
  // here. Without it there is no way to confirm from inside Discord whether
  // adminChannelId is even set, which is the same invisibility the alert
  // channel exists to fix.
  { name: 'config.json', path: CONFIG_PATH },
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
