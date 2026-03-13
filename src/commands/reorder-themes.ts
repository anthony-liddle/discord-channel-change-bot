import type { CommandHandler, ThemeEntry } from '../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, reorderTheme } from '../themes';
import { getThemeName } from '../rotation';
import { getState, saveState } from '../state';

interface IndexedTheme {
  theme: ThemeEntry;
  absoluteIndex: number;
}

function buildRotatedView(
  themes: ThemeEntry[],
  currentIndex: number,
): IndexedTheme[] {
  return themes.map((theme, i) => ({
    theme,
    absoluteIndex: (currentIndex + i) % themes.length,
  }));
}

function buildListText(
  items: IndexedTheme[],
  highlightDisplayIndex?: number,
): string {
  return (
    '**Current theme order:**\n' +
    items
      .map((item, i) => {
        const marker = i === highlightDisplayIndex ? ' →' : '';
        const currentMarker = i === 0 ? ' (current)' : '';
        return `${i + 1}. \`${getThemeName(item.theme)}\`${currentMarker}${marker}`;
      })
      .join('\n')
  );
}

function buildStep1Components(items: IndexedTheme[], userId: string) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`reorderThemeSelect-${userId}`)
    .setPlaceholder('Select a theme to move')
    .addOptions(
      items.map((item, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${i + 1}. ${getThemeName(item.theme)}`)
          .setValue(String(item.absoluteIndex)),
      ),
    );

  const doneButton = new ButtonBuilder()
    .setCustomId(`reorderThemeDone-${userId}`)
    .setLabel('✓ Done')
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(doneButton),
  ];
}

function buildRotatedViewFromThemes(themes: ThemeEntry[]): IndexedTheme[] {
  const { currentIndex } = getState();
  return buildRotatedView(themes, currentIndex);
}

function buildStep2Components(
  selectedIndex: number,
  total: number,
  userId: string,
) {
  const upButton = new ButtonBuilder()
    .setCustomId(`reorderThemeUp-${userId}`)
    .setLabel('↑ Move Up')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(selectedIndex === 0);

  const downButton = new ButtonBuilder()
    .setCustomId(`reorderThemeDown-${userId}`)
    .setLabel('↓ Move Down')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(selectedIndex === total - 1);

  const saveButton = new ButtonBuilder()
    .setCustomId(`reorderThemeSave-${userId}`)
    .setLabel('✓ Save')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`reorderThemeCancel-${userId}`)
    .setLabel('✕ Cancel')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      upButton,
      downButton,
      saveButton,
      cancelButton,
    ),
  ];
}

export const reorderThemesCmd: CommandHandler = async (interaction) => {
  if (!requireAdmin(interaction)) return;

  const userId = interaction.user.id;
  let themes = await getThemes();

  if (themes.length === 0) {
    await interaction.reply({
      content: 'No themes to reorder.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (themes.length === 1) {
    await interaction.reply({
      content: 'Nothing to reorder, only one theme exists.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (themes.length > 25) {
    await interaction.reply({
      content:
        "You have more themes than Discord's menu can handle (max 25). Sounds like a feature request for whoever built this thing. 👀",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let view = buildRotatedViewFromThemes(themes);

  const response = await interaction.reply({
    content: buildListText(view),
    components: buildStep1Components(view, userId),
    flags: MessageFlags.Ephemeral,
  });

  while (true) {
    let step1Interaction;
    try {
      step1Interaction = await response.awaitMessageComponent({
        filter: (i) =>
          i.user.id === userId &&
          (i.customId === `reorderThemeSelect-${userId}` ||
            i.customId === `reorderThemeDone-${userId}`),
        time: 5 * 60 * 1000,
      });
    } catch {
      await interaction.editReply({ content: 'Timed out.', components: [] });
      return;
    }

    if (step1Interaction.customId === `reorderThemeDone-${userId}`) {
      await step1Interaction.update({ content: 'Done!', components: [] });
      return;
    }

    // Value is the absolute file index of the selected theme
    const originalAbsoluteIndex = parseInt(
      (step1Interaction as StringSelectMenuInteraction).values[0],
    );
    let workingView = [...view];
    let selectedDisplayIndex = workingView.findIndex(
      (item) => item.absoluteIndex === originalAbsoluteIndex,
    );

    await step1Interaction.update({
      content: buildListText(workingView, selectedDisplayIndex),
      components: buildStep2Components(
        selectedDisplayIndex,
        workingView.length,
        userId,
      ),
    });

    let exitLoop = false;

    await new Promise<void>((resolve) => {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.user.id === userId &&
          [
            `reorderThemeUp-${userId}`,
            `reorderThemeDown-${userId}`,
            `reorderThemeSave-${userId}`,
            `reorderThemeCancel-${userId}`,
          ].includes(i.customId),
        time: 5 * 60 * 1000,
      });

      collector.on('collect', async (btn) => {
        if (
          btn.customId === `reorderThemeUp-${userId}` ||
          btn.customId === `reorderThemeDown-${userId}`
        ) {
          const newDisplayIndex =
            btn.customId === `reorderThemeUp-${userId}`
              ? selectedDisplayIndex - 1
              : selectedDisplayIndex + 1;
          const updated = [...workingView];
          const [moved] = updated.splice(selectedDisplayIndex, 1);
          updated.splice(newDisplayIndex, 0, moved);
          workingView = updated;
          selectedDisplayIndex = newDisplayIndex;

          await btn.update({
            content: buildListText(workingView, selectedDisplayIndex),
            components: buildStep2Components(
              selectedDisplayIndex,
              workingView.length,
              userId,
            ),
          });
        } else if (btn.customId === `reorderThemeSave-${userId}`) {
          collector.stop('save');
          try {
            const state = getState();
            const trackedName = getThemeName(themes[state.currentIndex]);
            const newAbsoluteIndex =
              workingView[selectedDisplayIndex].absoluteIndex;
            await reorderTheme(originalAbsoluteIndex, newAbsoluteIndex);
            themes = await getThemes();
            const newCurrentIndex = themes.findIndex(
              (t) => getThemeName(t) === trackedName,
            );
            await saveState({
              currentIndex:
                newCurrentIndex >= 0 ? newCurrentIndex : state.currentIndex,
            });
            view = buildRotatedViewFromThemes(themes);
            await btn.update({
              content: buildListText(view),
              components: buildStep1Components(view, userId),
            });
          } catch (err) {
            await btn.update({
              content: `Failed to save theme order.\n> ${(err as Error).message}`,
              components: [],
            });
            exitLoop = true;
          }
          resolve();
        } else if (btn.customId === `reorderThemeCancel-${userId}`) {
          collector.stop('cancel');
          await btn.update({
            content: buildListText(view),
            components: buildStep1Components(view, userId),
          });
          resolve();
        }
      });

      collector.on('end', (_, reason) => {
        if (reason !== 'save' && reason !== 'cancel') {
          interaction
            .editReply({ content: 'Timed out.', components: [] })
            .catch(console.error);
          exitLoop = true;
          resolve();
        }
      });
    });

    if (exitLoop) return;
  }
};
