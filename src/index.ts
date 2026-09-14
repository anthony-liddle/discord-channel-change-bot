import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import { getConfig, loadConfig } from './config';
import { loadState } from './state';
import { scheduleCronJob, stopScheduledTask } from './scheduler';
import { validatePermissions, getThemeName } from './rotation';
import { makeScheduledRotation } from './scheduled-rotation';
import { getCommandHandler, resolveCommandKey } from './commands';
import { handleThemeAutocomplete } from './commands/theme-autocomplete';
import { loadThemes } from './themes';
import { formatHandlerError, reportHandlerError } from './interaction-errors';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('ERROR: DISCORD_TOKEN not set in environment variables');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('clientReady', async () => {
  loadConfig();
  const themes = await loadThemes();
  console.log(`Logged in as ${client.user!.tag}`);

  const config = getConfig();
  await loadState();

  const hasPermissions = await validatePermissions(client, config);
  if (!hasPermissions) {
    console.warn(
      'WARNING: Bot may not be able to rename the channel. Check permissions.',
    );
  }

  const schedule = config.schedule ?? '0 9 * * 1';
  const timezone = config.timezone ?? 'America/New_York';

  try {
    scheduleCronJob(
      schedule,
      timezone,
      makeScheduledRotation(client, getConfig),
    );
  } catch {
    console.error(`ERROR: Invalid cron schedule: ${schedule}`);
    process.exit(1);
  }

  const { getState } = await import('./state');
  const state = getState();
  console.log(`Current theme index: ${state.currentIndex}`);
  console.log(
    `Next theme: ${getThemeName(themes[state.currentIndex % themes.length])}`,
  );
  console.log('Bot is ready!');
});

client.on('interactionCreate', async (interaction) => {
  // Autocomplete arrives here too and used to be dropped by the guard below.
  // It has its own 3 second window, cannot be deferred, and cannot show an
  // error, so the handler swallows its own failures rather than reporting them.
  if (interaction.isAutocomplete()) {
    await handleThemeAutocomplete(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const key = resolveCommandKey(interaction);
  const handler = getCommandHandler(key);
  if (!handler) return;

  try {
    await handler(interaction, { client, config: getConfig() });
  } catch (err) {
    await reportHandlerError(interaction, err);
  }
});

// The dispatch try/catch cannot see a promise nobody awaited. Without this a
// single floating rejection takes the process down and the cron schedule with
// it, which is a far worse outcome than a broken command.
process.on('unhandledRejection', (reason) => {
  console.error(`Unhandled rejection: ${formatHandlerError(reason)}`, reason);
});

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  stopScheduledTask();
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(token);
