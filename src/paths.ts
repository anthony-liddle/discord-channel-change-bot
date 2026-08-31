import path from 'path';

/**
 * Where the bot's durable state lives: themes.json, state.json, config.json.
 *
 * PROJECT_ROOT is two levels above this module. Compiled to dist/src/paths.js
 * that resolves to the repo root, which is where these files have always lived,
 * so running with no DATA_DIR set behaves exactly as before.
 *
 * DATA_DIR overrides it. Managed hosts rebuild the application directory on
 * every deploy and mount persistent storage somewhere else, so without this the
 * theme list and the rotation position would be silently reset each time the
 * bot is redeployed. Set DATA_DIR to the mount point of the persistent disk.
 */
export const PROJECT_ROOT = path.join(__dirname, '..', '..');

export function dataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured ? path.resolve(configured) : PROJECT_ROOT;
}

export function dataPath(filename: string): string {
  return path.join(dataDir(), filename);
}
