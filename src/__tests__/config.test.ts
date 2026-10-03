import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({ channelId: 'original-channel' }),
    ),
  },
}));

import fs from 'fs';
import fsp from 'fs/promises';
import { saveConfig, getConfig, reloadConfig } from '../config';

// ─── saveConfig ───────────────────────────────────────────────────────────────

describe('saveConfig', () => {
  beforeEach(() => {
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
    vi.mocked(fsp.rename).mockResolvedValue(undefined);
    reloadConfig(); // reset in-memory cache before each test
  });

  it('writes config as pretty-printed JSON to a .tmp path', async () => {
    await saveConfig({ channelId: 'new-channel' });

    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      expect.stringContaining('.tmp'),
      JSON.stringify({ channelId: 'new-channel' }, null, 2),
    );
  });

  it('renames the .tmp file to the real config path', async () => {
    await saveConfig({ channelId: 'new-channel' });

    const [tmpPath] = vi.mocked(fsp.writeFile).mock.calls[0] as [string];
    const [from, to] = vi.mocked(fsp.rename).mock.calls[0] as [string, string];

    expect(from).toBe(tmpPath);
    expect(to).not.toContain('.tmp');
    expect(to).toContain('config.json');
  });

  it('updates the in-memory cache so getConfig returns the saved config', async () => {
    await saveConfig({ channelId: 'new-channel' });

    expect(getConfig().channelId).toBe('new-channel');
  });

  it('preserves optional fields when saving', async () => {
    const config = {
      channelId: 'new-channel',
      schedule: '0 9 * * 1',
      timezone: 'America/Los_Angeles',
    };
    await saveConfig(config);

    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(config, null, 2),
    );
  });
});

// ─── loading ──────────────────────────────────────────────────────────────────

// config.json is read at startup and on every command. It is hand edited on
// the volume, so a missing or broken one has to fail with a message that says
// what to fix, not with whatever the first property access throws.
describe('loading config.json', () => {
  // clearMocks resets calls, not return values, so a test that makes the
  // file vanish would otherwise leave it missing for every test after it.
  afterEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  function fileHolds(text: string) {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(text);
  }

  it('says to create it from the example when it is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(() => reloadConfig()).toThrow(
      'config.json not found. Please create it from config.example.json',
    );
  });

  it('refuses a file with no channelId', () => {
    fileHolds(JSON.stringify({ schedule: '0 8 * * 1' }));

    expect(() => reloadConfig()).toThrow(
      'config.json must contain a valid "channelId" string',
    );
  });

  // A channel id pasted without quotes is a number, and loses precision past
  // 2^53, so it would point at a different channel.
  it('refuses a channelId that is not text', () => {
    fileHolds('{"channelId": 111111111111111111}');

    expect(() => reloadConfig()).toThrow(
      'config.json must contain a valid "channelId" string',
    );
  });

  it('throws rather than defaulting when the file will not parse', () => {
    fileHolds('{"channelId": "1",');

    expect(() => reloadConfig()).toThrow(SyntaxError);
  });

  it('reads the file once and serves later reads from memory', () => {
    fileHolds(JSON.stringify({ channelId: 'first' }));
    reloadConfig();
    vi.mocked(fs.readFileSync).mockClear();

    expect(getConfig().channelId).toBe('first');
    expect(getConfig().channelId).toBe('first');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('reads the file again on reload', () => {
    fileHolds(JSON.stringify({ channelId: 'first' }));
    reloadConfig();
    fileHolds(JSON.stringify({ channelId: 'second' }));

    expect(reloadConfig().channelId).toBe('second');
    expect(getConfig().channelId).toBe('second');
  });
});
