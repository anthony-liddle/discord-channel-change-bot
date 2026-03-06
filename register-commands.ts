import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

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

const commands = [
  new SlashCommandBuilder()
    .setName('theme-bot')
    .setDescription('Theme rotation bot commands')
    .addSubcommand((sub) =>
      sub
        .setName('themes')
        .setDescription('Preview the upcoming theme rotation'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rotate-now')
        .setDescription('Immediately rotate to the next theme (Admin only)'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reload-config')
        .setDescription(
          'Reload the config file without restarting (Admin only)',
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-theme')
        .setDescription(
          'Add a theme using "Channel Name", and "Theme Message"',
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Configure bot settings')
        .addSubcommand((sub) =>
          sub
            .setName('channel')
            .setDescription(
              'Set the channel to rename each rotation (Admin only)',
            ),
        ),
    ),
].map((command) => command.toJSON());

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
