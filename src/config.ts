import fs from 'fs';
import path from 'path';
import type { Config } from './types';

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      'config.json not found. Please create it from config.example.json',
    );
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Config;

  if (!raw.channelId || typeof raw.channelId !== 'string') {
    throw new Error('config.json must contain a valid "channelId" string');
  }
  if (!Array.isArray(raw.themes) || raw.themes.length === 0) {
    throw new Error('config.json must contain a non-empty "themes" array');
  }

  cachedConfig = raw;
  return raw;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function reloadConfig(): Config {
  cachedConfig = null;
  return loadConfig();
}
