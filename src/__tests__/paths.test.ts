import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { PROJECT_ROOT, dataDir, dataPath } from '../paths';

// themes.json, state.json and config.json are the only durable state this bot
// has. On a managed host the app directory is rebuilt on every deploy and the
// persistent disk is mounted somewhere else, so these paths have to be
// redirectable or a deploy silently wipes the theme list.

const original = process.env.DATA_DIR;

beforeEach(() => {
  delete process.env.DATA_DIR;
});

afterEach(() => {
  if (original === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = original;
});

describe('dataDir', () => {
  // PROJECT_ROOT keeps the pre-existing behaviour: two levels above the
  // compiled module, which is the repo root once tsc has emitted to dist/src.
  // Anyone running without DATA_DIR must see no change at all.
  it('falls back to the project root when DATA_DIR is unset', () => {
    expect(dataDir()).toBe(PROJECT_ROOT);
  });

  it('uses DATA_DIR when it is set', () => {
    process.env.DATA_DIR = '/data';
    expect(dataDir()).toBe('/data');
  });

  it('ignores an empty DATA_DIR rather than resolving to nothing', () => {
    process.env.DATA_DIR = '';
    expect(dataDir()).toBe(PROJECT_ROOT);
  });

  it('ignores a whitespace-only DATA_DIR', () => {
    process.env.DATA_DIR = '   ';
    expect(dataDir()).toBe(PROJECT_ROOT);
  });

  it('reads the environment on every call, not once at import', () => {
    process.env.DATA_DIR = '/first';
    const first = dataDir();
    process.env.DATA_DIR = '/second';
    expect([first, dataDir()]).toEqual(['/first', '/second']);
  });

  it('always returns an absolute path', () => {
    process.env.DATA_DIR = './scratch';
    expect(path.isAbsolute(dataDir())).toBe(true);
  });

  it('has an absolute project root fallback', () => {
    expect(path.isAbsolute(PROJECT_ROOT)).toBe(true);
  });
});

describe('dataPath', () => {
  it('joins a filename onto the fallback root', () => {
    expect(dataPath('themes.json')).toBe(
      path.join(PROJECT_ROOT, 'themes.json'),
    );
  });

  it('joins a filename onto DATA_DIR when set', () => {
    process.env.DATA_DIR = '/data';
    expect(dataPath('themes.json')).toBe(path.join('/data', 'themes.json'));
  });

  it('resolves a relative DATA_DIR against the working directory', () => {
    process.env.DATA_DIR = './scratch';
    expect(dataPath('config.json')).toBe(
      path.resolve('./scratch', 'config.json'),
    );
  });

  it('keeps the three state files in the same directory', () => {
    process.env.DATA_DIR = '/data';
    const dirs = ['themes.json', 'state.json', 'config.json'].map((f) =>
      path.dirname(dataPath(f)),
    );
    expect(new Set(dirs).size).toBe(1);
  });
});
