import cron, { type ScheduledTask } from 'node-cron';

let scheduledTask: ScheduledTask | null = null;

/**
 * Replaces the weekly job. The new job is built before the old one is stopped,
 * so a bad expression or an unknown timezone throws with the current schedule
 * still running. Stopping first used to leave nothing scheduled at all, while
 * reload-config told the admin only that the new schedule was invalid.
 */
export function scheduleCronJob(
  schedule: string,
  timezone: string,
  callback: () => Promise<void>,
): ScheduledTask {
  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }

  // Throws a RangeError for an unknown timezone, which is why it comes before
  // the old job is stopped.
  const task = cron.schedule(
    schedule,
    async () => {
      console.log(
        `[${new Date().toISOString()}] Running scheduled theme rotation`,
      );
      try {
        await callback();
      } catch (err) {
        console.error(
          `ERROR in scheduled rotation callback: ${(err as Error).message}`,
        );
      }
    },
    { timezone },
  );

  if (scheduledTask) {
    scheduledTask.stop();
    console.log('Stopped previous cron job');
  }
  scheduledTask = task;

  console.log(`Scheduled rotation: ${schedule} (${timezone})`);
  console.log(`Current time: ${new Date().toISOString()}`);

  return task;
}

export function stopScheduledTask(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
