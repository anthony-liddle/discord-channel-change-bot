import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../themes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../themes')>()),
  getThemes: vi.fn(async () => [
    { name: 'Weekly theme origami', message: 'Fold something.' },
    { name: 'Weekly theme pottery', message: 'Show us.' },
    { name: 'Weekly theme jazz', message: 'Play something.' },
  ]),
}));

import fsp from 'fs/promises';
import { getState, loadState, setStateIndex, STATE_PATH } from '../state';
import { rotateTheme } from '../rotation';

function stateFileHolds(text: string) {
  vi.mocked(fsp.readFile).mockResolvedValue(text as never);
}

function noStateFile() {
  vi.mocked(fsp.readFile).mockRejectedValue(
    Object.assign(new Error('no such file'), { code: 'ENOENT' }),
  );
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── loading ──────────────────────────────────────────────────────────────────

describe('loadState', () => {
  it('loads the saved position', async () => {
    stateFileHolds('{"currentIndex":5}');

    await loadState();

    expect(getState().currentIndex).toBe(5);
    expect(console.warn).not.toHaveBeenCalled();
  });

  // A fresh install has no state.json, and that is not worth a warning.
  it('starts at 0 without a warning when there is no file', async () => {
    noStateFile();

    await loadState();

    expect(getState().currentIndex).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  // docs/HOSTING.md tells a reader that this exact line is the signal that 0
  // came from a broken file rather than from the rotation.
  it("starts at 0 with the runbook's warning when the file will not parse", async () => {
    stateFileHolds('{"currentIndex": 5');

    await loadState();

    expect(getState().currentIndex).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: Could not parse state.json, starting fresh',
    );
  });
});

// ─── a file that parses but is not a rotation position ────────────────────────

// state.json is hand edited on the volume when the rotation is resynced, and
// JSON.parse accepts plenty that is not a position. Each of these used to be
// taken as is.
const MALFORMED: [string, string][] = [
  ['null', 'null'],
  ['a list', '[3]'],
  ['an object with no position', '{}'],
  ['a position written as text', '{"currentIndex":"5"}'],
  ['a negative position', '{"currentIndex":-1}'],
  ['a fractional position', '{"currentIndex":1.5}'],
  ['a null position', '{"currentIndex":null}'],
];

describe('a state.json that parses but holds no usable position', () => {
  for (const [what, text] of MALFORMED) {
    it(`starts at 0 for ${what}`, async () => {
      stateFileHolds(text);

      await loadState();

      expect(getState()).toEqual({ currentIndex: 0 });
    });

    it(`warns with the runbook's line and the bad value for ${what}`, async () => {
      stateFileHolds(text);

      await loadState();

      const warning = vi.mocked(console.warn).mock.calls[0]?.[0] as string;
      expect(warning).toMatch(/^Warning: Could not parse state\.json/);
      expect(warning).toContain(text);
    });
  }
});

// What the shape check is for. Without it, {} gave a position of undefined,
// the rotation computed a NaN index and found no theme there, and failed the
// same way every week; null made getState() itself null.
describe('a malformed state.json does not stop the rotation', () => {
  for (const text of ['{}', 'null']) {
    it(`rotates from the start after loading ${text}`, async () => {
      stateFileHolds(text);
      await loadState();

      const channel = {
        name: 'weekly-theme-origami',
        setName: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
      };
      const result = await rotateTheme(
        {
          channels: { fetch: vi.fn(async () => channel) },
        } as unknown as Client,
        { channelId: '111111111111111111' },
      );

      expect(result).toMatchObject({
        success: true,
        themeName: 'Weekly theme pottery',
      });
    });
  }
});

// ─── saving ───────────────────────────────────────────────────────────────────

describe('setStateIndex', () => {
  it('updates the position the rotation reads', async () => {
    await setStateIndex(2);

    expect(getState().currentIndex).toBe(2);
  });

  // Written to a temporary file and renamed into place, so a crash mid-write
  // leaves the previous state.json whole rather than half written.
  it('writes state.json atomically through a temporary file', async () => {
    await setStateIndex(4);

    expect(fsp.writeFile).toHaveBeenCalledWith(
      `${STATE_PATH}.tmp`,
      JSON.stringify({ currentIndex: 4 }, null, 2),
    );
    expect(fsp.rename).toHaveBeenCalledWith(`${STATE_PATH}.tmp`, STATE_PATH);
    expect(vi.mocked(fsp.writeFile).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fsp.rename).mock.invocationCallOrder[0],
    );
  });
});
