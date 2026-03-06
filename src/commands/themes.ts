import type { CommandHandler } from '../types';
import { getUpcomingThemes } from '../rotation';
import { getThemes } from '../themes';

export const themes: CommandHandler = async (interaction) => {
  const themes = await getThemes();
  const upcoming = getUpcomingThemes(themes, 5);

  let response = '**Upcoming Themes:**\n';
  for (const item of upcoming) {
    const marker = item.isCurrent ? ' (current)' : '';
    response += `Week ${item.week}: \`${item.name}\`${marker}\n`;
  }
  response += `\n*Total themes in rotation: ${themes.length}*`;

  await interaction.reply({ content: response, ephemeral: true });
};
