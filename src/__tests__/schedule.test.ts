import { describe, it, expect } from 'vitest';
import { parseCron, formatSchedule } from '../commands/config/schedule';

// ─── parseCron ────────────────────────────────────────────────────────────────

describe('parseCron', () => {
  it('parses a valid weekly cron expression', () => {
    expect(parseCron('0 9 * * 1')).toEqual({ day: '1', hour: '9' });
  });

  it('parses Sunday (day 0)', () => {
    expect(parseCron('0 0 * * 0')).toEqual({ day: '0', hour: '0' });
  });

  it('parses Saturday at midnight', () => {
    expect(parseCron('0 0 * * 6')).toEqual({ day: '6', hour: '0' });
  });

  it('parses noon on Wednesday', () => {
    expect(parseCron('0 12 * * 3')).toEqual({ day: '3', hour: '12' });
  });

  it('returns null for non-zero minutes', () => {
    expect(parseCron('30 9 * * 1')).toBeNull();
  });

  it('returns null when day-of-month is not wildcard', () => {
    expect(parseCron('0 9 1 * 1')).toBeNull();
  });

  it('returns null when month is not wildcard', () => {
    expect(parseCron('0 9 * 6 1')).toBeNull();
  });

  it('returns null for non-numeric day of week', () => {
    expect(parseCron('0 9 * * MON')).toBeNull();
  });

  it('returns null for expressions with wrong number of parts', () => {
    expect(parseCron('0 9 * *')).toBeNull();
    expect(parseCron('0 9 * * 1 2')).toBeNull();
  });

  it('returns null for out-of-range day', () => {
    expect(parseCron('0 9 * * 7')).toBeNull();
  });

  it('returns null for out-of-range hour', () => {
    expect(parseCron('0 24 * * 1')).toBeNull();
  });
});

// ─── formatSchedule ───────────────────────────────────────────────────────────

describe('formatSchedule', () => {
  it('formats a standard weekly schedule in plain English', () => {
    expect(formatSchedule('0 9 * * 1', 'America/New_York')).toBe(
      'every **Monday** at **9:00 AM** (America/New_York)',
    );
  });

  it('formats midnight correctly', () => {
    expect(formatSchedule('0 0 * * 0', 'UTC')).toBe(
      'every **Sunday** at **12:00 AM (midnight)** (UTC)',
    );
  });

  it('formats noon correctly', () => {
    expect(formatSchedule('0 12 * * 5', 'UTC')).toBe(
      'every **Friday** at **12:00 PM (noon)** (UTC)',
    );
  });

  it('formats PM hours correctly', () => {
    expect(formatSchedule('0 18 * * 6', 'UTC')).toBe(
      'every **Saturday** at **6:00 PM** (UTC)',
    );
  });

  it('falls back to showing the raw cron for unsupported formats', () => {
    const result = formatSchedule('*/15 * * * *', 'UTC');
    expect(result).toContain('*/15 * * * *');
    expect(result).toContain('UTC');
  });
});
