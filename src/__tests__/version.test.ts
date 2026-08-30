import { describe, it, expect } from 'vitest';
import { DEPLOY_MARKER } from '../version';

// The marker is hand-maintained and read by eye in Discord. A malformed bump
// should fail here rather than ship something unreadable to the one surface
// that reports what is actually running.

describe('DEPLOY_MARKER', () => {
  it('matches the date and sequence shape', () => {
    expect(DEPLOY_MARKER).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('has a real calendar date', () => {
    const [date] = DEPLOY_MARKER.split('.');
    expect(Number.isNaN(Date.parse(date))).toBe(false);
  });

  it('sorts lexicographically by date', () => {
    expect(['2026-09-01.1', DEPLOY_MARKER, '2026-01-01.1'].sort()[0]).toBe(
      '2026-01-01.1',
    );
  });

  it('contains no whitespace, so it survives being read off a phone screen', () => {
    expect(DEPLOY_MARKER).not.toMatch(/\s/);
  });
});
