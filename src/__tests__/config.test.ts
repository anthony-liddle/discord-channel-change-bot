import { vi, describe, it, expect, beforeEach } from 'vitest';

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
