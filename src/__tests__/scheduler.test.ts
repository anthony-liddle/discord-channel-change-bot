import { vi, describe, it, expect, beforeEach } from 'vitest';

interface FakeTask {
  expression: string;
  timezone: string | undefined;
  run: () => Promise<void>;
  stop: ReturnType<typeof vi.fn>;
}
const tasks: FakeTask[] = [];

// node-cron's real validate runs; only schedule is replaced, because the real
// one starts timers. Its one other behaviour that matters here is mirrored: an
// unknown timezone throws a RangeError (checked against node-cron 4 on
// 2026-10-01).
vi.mock('node-cron', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-cron')>();
  return {
    default: {
      ...actual.default,
      schedule: vi.fn(
        (
          expression: string,
          run: () => Promise<void>,
          options?: { timezone?: string },
        ) => {
          if (options?.timezone === 'Not/AZone') {
            throw new RangeError('Invalid time zone specified: Not/AZone');
          }
          const task: FakeTask = {
            expression,
            timezone: options?.timezone,
            run,
            stop: vi.fn(),
          };
          tasks.push(task);
          return task;
        },
      ),
    },
  };
});

import { scheduleCronJob, stopScheduledTask } from '../scheduler';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  stopScheduledTask();
  tasks.length = 0;
});

const MONDAY_8AM = '0 8 * * 1';
const TZ = 'America/Los_Angeles';

describe('scheduleCronJob', () => {
  it('schedules the expression in the configured timezone', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ expression: MONDAY_8AM, timezone: TZ });
  });

  it('runs the rotation when the schedule fires', async () => {
    const rotation = vi.fn(async () => {});
    scheduleCronJob(MONDAY_8AM, TZ, rotation);

    await tasks[0].run();

    expect(rotation).toHaveBeenCalledTimes(1);
  });

  // An escaping rejection would reach the process-level handler at best. The
  // schedule has to survive a bad week and fire again the next.
  it('contains a rotation that throws, and logs it', async () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {
      throw new Error('disk gone');
    });

    await expect(tasks[0].run()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      'ERROR in scheduled rotation callback: disk gone',
    );
  });

  // reload-config and config schedule both reschedule. Two live jobs would
  // both fire every Monday.
  it('stops the previous job when rescheduling', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});
    scheduleCronJob('0 9 * * 1', TZ, async () => {});

    expect(tasks[0].stop).toHaveBeenCalled();
    expect(tasks[1].stop).not.toHaveBeenCalled();
  });
});

// reload-config reads the schedule from a hand-edited config.json, catches the
// throw, and replies that the schedule is invalid. The admin reads that as the
// old schedule carrying on, so it has to.
describe('a bad schedule leaves the running one running', () => {
  it('refuses an invalid expression without stopping the current job', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});

    expect(() => scheduleCronJob('every monday', TZ, async () => {})).toThrow(
      'Invalid cron schedule: every monday',
    );
    expect(tasks[0].stop).not.toHaveBeenCalled();
  });

  it('refuses an unknown timezone without stopping the current job', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});

    expect(() =>
      scheduleCronJob(MONDAY_8AM, 'Not/AZone', async () => {}),
    ).toThrow(RangeError);
    expect(tasks[0].stop).not.toHaveBeenCalled();
  });

  it('keeps stopping the original job on the next good reschedule', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});
    expect(() => scheduleCronJob('every monday', TZ, async () => {})).toThrow();

    scheduleCronJob('0 9 * * 1', TZ, async () => {});

    expect(tasks[0].stop).toHaveBeenCalledTimes(1);
  });
});

describe('stopScheduledTask', () => {
  it('stops the current job', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});

    stopScheduledTask();

    expect(tasks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('is harmless when called twice', () => {
    scheduleCronJob(MONDAY_8AM, TZ, async () => {});

    stopScheduledTask();
    stopScheduledTask();

    expect(tasks[0].stop).toHaveBeenCalledTimes(1);
  });
});
