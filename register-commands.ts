import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { COMMAND_DEFINITIONS } from './src/command-definitions';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} not set in environment variables`);
    process.exit(1);
  }
  return value;
}

const token = requireEnv('DISCORD_TOKEN');
const clientId = requireEnv('CLIENT_ID');

// Defined in src so a test can check them against the router; see the
// comment there.
const commands = COMMAND_DEFINITIONS;

const rest = new REST({ version: '10' }).setToken(token);

async function registerCommands(): Promise<void> {
  try {
    console.log('Registering slash commands...');

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    console.log('Slash commands registered successfully!');
    console.log('Note: Global commands may take up to 1 hour to appear.');
    console.log(
      'For instant updates during development, use guild-specific commands.',
    );
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

registerCommands();
