import cron, { type ScheduledTask } from 'node-cron';

let scheduledTask: ScheduledTask | null = null;

export function scheduleCronJob(
  schedule: string,
  timezone: string,
  callback: () => void,
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
    () => {
      console.log(
        `[${new Date().toISOString()}] Running scheduled theme rotation`,
      );
      callback();
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
