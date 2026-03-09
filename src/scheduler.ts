import cron, { type ScheduledTask } from 'node-cron';

let scheduledTask: ScheduledTask | null = null;

export function scheduleCronJob(
  schedule: string,
  timezone: string,
  callback: () => Promise<void>,
): ScheduledTask {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('Stopped previous cron job');
  }

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid cron schedule: ${schedule}`);
  }

  scheduledTask = cron.schedule(
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

  console.log(`Scheduled rotation: ${schedule} (${timezone})`);
  console.log(`Current time: ${new Date().toISOString()}`);

  return scheduledTask;
}

export function stopScheduledTask(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
