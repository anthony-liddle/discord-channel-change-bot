import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn(), rename: vi.fn() },
}));

import fsp from 'fs/promises';
import { addTheme, updateTheme, reloadThemes } from '../themes';
import { auditThemes } from '../theme-validation';

/**
 * The write path and the reload audit have to agree, or a name accepted through
 * a modal turns into a reported problem at the next reload, and the admin is
 * told off for something the bot let them do.
 *
 * Both now compare by the channel name a theme produces, which is the rule
 * themes.ts always claimed: two themes that rename the channel to the same
 * thing are duplicates for every purpose this bot has.
 */

/**
 * Pairs that must be treated as the same theme, with why. Neutral fixture names
 * throughout; none of these are real themes from the server.
 */
const SAME = [
  ['Monochrome', 'MONOCHROME', 'differs only by case'],
  ['Monochrome', '  Monochrome  ', 'differs only by surrounding whitespace'],
  ['Golden Hour', 'Golden  Hour', 'differs only by repeated inner whitespace'],
  ['Golden Hour', 'Golden\tHour', 'a tab and a space both become one hyphen'],
  ['Cafe Night', 'Café Night', 'accent folding makes both cafe-night'],
  ['Macro!', 'Macro', 'punctuation is dropped from a channel name'],
] as const;

const DIFFERENT = [
  ['Monochrome', 'Macro', 'plainly different names'],
  ['Golden Hour', 'Golden Hours', 'one trailing letter is a real difference'],
] as const;

function setupThemes(themes: unknown[]) {
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ themes }) as unknown as Buffer,
  );
  vi.mocked(fsp.writeFile).mockResolvedValue(undefined);
  vi.mocked(fsp.rename).mockResolvedValue(undefined);
}

/** Does the write path consider `candidate` a duplicate of `existing`? */
async function writePathRejects(
  existing: string,
  candidate: string,
): Promise<boolean> {
  setupThemes([{ name: existing, message: 'm' }]);
  await reloadThemes();
  try {
    await addTheme(candidate, 'm');
    return false;
  } catch (err) {
    return /already exists/i.test((err as Error).message);
  }
}

/** Does the reload audit consider the second entry a duplicate of the first? */
function auditRejects(existing: string, candidate: string): boolean {
  const problems = auditThemes([
    { name: existing, message: 'm' },
    { name: candidate, message: 'm' },
  ]);
  return problems.some((p) => p.kind === 'duplicate');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the write path and the reload audit agree on what a duplicate is', () => {
  for (const [a, b, why] of SAME) {
    it(`write path rejects "${b}" beside "${a}", because it ${why}`, async () => {
      expect(await writePathRejects(a, b)).toBe(true);
    });

    it(`reload audit reports "${b}" beside "${a}", because it ${why}`, () => {
      expect(auditRejects(a, b)).toBe(true);
    });
  }

  for (const [a, b, why] of DIFFERENT) {
    it(`write path allows "${b}" beside "${a}", because they are ${why}`, async () => {
      expect(await writePathRejects(a, b)).toBe(false);
    });

    it(`reload audit allows "${b}" beside "${a}", because they are ${why}`, () => {
      expect(auditRejects(a, b)).toBe(false);
    });
  }
});

describe('updateTheme uses the same duplicate rule as addTheme', () => {
  it('rejects renaming an entry onto another entry channel name', async () => {
    setupThemes([
      { name: 'Monochrome', message: 'm' },
      { name: 'Macro', message: 'm' },
    ]);
    await reloadThemes();

    await expect(updateTheme(1, 'MONOCHROME', 'm')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('rejects an accented spelling of another entry name', async () => {
    setupThemes([
      { name: 'Cafe Night', message: 'm' },
      { name: 'Macro', message: 'm' },
    ]);
    await reloadThemes();

    await expect(updateTheme(1, 'Café Night', 'm')).rejects.toThrow(
      /already exists/i,
    );
  });

  it('still lets an entry keep its own name', async () => {
    setupThemes([
      { name: 'Monochrome', message: 'm' },
      { name: 'Macro', message: 'm' },
    ]);
    await reloadThemes();

    await expect(
      updateTheme(1, 'Macro', 'new message'),
    ).resolves.toBeUndefined();
  });

  it('lets an entry keep its own name in a different case', async () => {
    setupThemes([
      { name: 'Monochrome', message: 'm' },
      { name: 'Macro', message: 'm' },
    ]);
    await reloadThemes();

    await expect(
      updateTheme(1, 'MACRO', 'new message'),
    ).resolves.toBeUndefined();
  });
});

// A malformed entry has its own problem reported. It must not also swallow a
// real duplicate by colliding with every other broken entry.
describe('entries with no usable name are not duplicates of each other', () => {
  it('does not report two unusable names as duplicates of one another', () => {
    const problems = auditThemes([
      { name: '!!!', message: 'm' },
      { name: '???', message: 'm' },
    ]);
    expect(problems.filter((p) => p.kind === 'duplicate')).toHaveLength(0);
  });
});
