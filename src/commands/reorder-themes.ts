import type { CommandHandler, ThemeEntry } from '../types';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requireAdmin } from './index';
import { getThemes, saveThemes } from '../themes';
import { getState, saveState } from '../state';
import { themeNameText } from './theme-picker';
import {
  applyMove,
  buildReorderPages,
  pageContaining,
  parseMove,
} from './reorder-view';

export interface IndexedTheme {
  theme: ThemeEntry;
  absoluteIndex: number;
}

export function buildRotatedView(
  themes: ThemeEntry[],
  currentIndex: number,
): IndexedTheme[] {
  return Array.from({ length: themes.length }, (_, i) => {
    const absoluteIndex = (currentIndex + i) % themes.length;
    return { theme: themes[absoluteIndex], absoluteIndex };
  });
}

const TIMEOUT = 5 * 60 * 1000;

const FOOTER =
  '\nUse **Move** and give the position to move and where to put it. ' +
  'Positions come from this list, and a move works across pages.';

/**
 * Reordering a list of any length.
 *
 * Autocomplete solved edit and delete, which only ever need one theme. Reorder
 * needs the whole list visible, so the fix is different: the list is paged text
 * rather than a menu, and a move is typed as two positions rather than walked
 * one step at a time.
 *
 * That matters for the workflow. Moving a theme from position 30 to position 3
 * used to be twenty seven clicks of "move up". It is now one Move click and one
 * form, whatever the distance and whatever the list length. The page buttons
 * only change what is on screen; they are never needed to perform a move.
 *
 * Each move is saved as it happens. There is no bulk cancel, which is the
 * trade: losing a sitting's worth of moves to the five minute timeout would be
 * worse than having to move something back.
 */
export const reorderThemesCmd: CommandHandler = async (interaction) => {
  if (!(await requireAdmin(interaction))) return;

  // Acknowledge before building any component. This was the last handler in
  // the codebase that built components as an argument to reply(), which put
  // builder validation inside the 3 second window with no way to report it.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let themes = await getThemes();

  if (themes.length === 0) {
    await interaction.editReply({ content: 'No themes to reorder.' });
    return;
  }

  if (themes.length === 1) {
    await interaction.editReply({
      content: 'Nothing to reorder, only one theme exists.',
    });
    return;
  }

  const prevId = `reorderPrev-${interaction.id}`;
  const nextId = `reorderNext-${interaction.id}`;
  const moveId = `reorderMove-${interaction.id}`;
  const doneId = `reorderDone-${interaction.id}`;
  const modalId = `reorderMoveModal-${interaction.id}`;

  let pageIndex = 0;
  let notice = '';

  function render() {
    const view = buildRotatedView(themes, getState().currentIndex);
    const pages = buildReorderPages(view);
    if (pageIndex > pages.length - 1) pageIndex = pages.length - 1;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pageIndex >= pages.length - 1),
      new ButtonBuilder()
        .setCustomId(moveId)
        .setLabel('Move')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(doneId)
        .setLabel('Done')
        .setStyle(ButtonStyle.Success),
    );

    const body = notice ? `${pages[pageIndex]}\n\n${notice}` : pages[pageIndex];
    return { content: `${body}\n${FOOTER}`, components: [row] };
  }

  const response = await interaction.editReply(render());

  while (true) {
    let button;
    try {
      button = await response.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.user.id === interaction.user.id &&
          [prevId, nextId, moveId, doneId].includes(i.customId),
        time: TIMEOUT,
      });
    } catch {
      await interaction.editReply({ content: 'Timed out.', components: [] });
      return;
    }

    if (button.customId === doneId) {
      notice = '';
      const view = buildRotatedView(themes, getState().currentIndex);
      await button.update({
        content: buildReorderPages(view)[pageIndex],
        components: [],
      });
      return;
    }

    if (button.customId === prevId || button.customId === nextId) {
      pageIndex += button.customId === nextId ? 1 : -1;
      notice = '';
      await button.update(render());
      continue;
    }

    const total = themes.length;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle('Move a theme');

    const fromInput = new TextInputBuilder()
      .setCustomId('fromPosition')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`1 to ${total}`)
      .setMaxLength(4)
      .setRequired(true);

    const toInput = new TextInputBuilder()
      .setCustomId('toPosition')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`1 to ${total}`)
      .setMaxLength(4)
      .setRequired(true);

    modal.addLabelComponents([
      new LabelBuilder()
        .setLabel('Move the theme at position')
        .setDescription('The number shown beside it in the list')
        .setTextInputComponent(fromInput),
      new LabelBuilder()
        .setLabel('To position')
        .setDescription('Where it should end up')
        .setTextInputComponent(toInput),
    ]);

    await button.showModal(modal);

    // Keyed on interaction.id, not the user, because awaitModalSubmit collects
    // client wide and two live reorder runs would otherwise both take a submit.
    let submitted: ModalSubmitInteraction;
    try {
      submitted = await interaction.awaitModalSubmit({
        filter: (i) =>
          i.customId === modalId && i.user.id === interaction.user.id,
        time: TIMEOUT,
      });
    } catch {
      notice = 'That move form timed out. Press Move to try again.';
      await interaction.editReply(render());
      continue;
    }

    try {
      await submitted.deferUpdate();
    } catch {
      // Nothing to do. The list is still redrawn below.
    }

    const move = parseMove(
      submitted.fields.getTextInputValue('fromPosition'),
      submitted.fields.getTextInputValue('toPosition'),
      themes.length,
    );

    if (!move.ok) {
      notice = `Not moved. ${move.reason}`;
      await interaction.editReply(render());
      continue;
    }

    try {
      const state = getState();
      const trackedName = themeNameText(themes[state.currentIndex]);
      const reordered = applyMove(
        themes,
        state.currentIndex,
        move.from,
        move.to,
      );

      await saveThemes(reordered);
      themes = await getThemes();

      // The view starts at currentIndex, so moving something to the front
      // changes which theme sits at that file position. Follow the theme that
      // was current by name rather than letting the rotation jump.
      const followed = themes.findIndex(
        (t) => themeNameText(t) === trackedName,
      );
      if (followed >= 0 && followed !== state.currentIndex) {
        await saveState({ currentIndex: followed });
      }

      notice = `Moved theme ${move.from + 1} to position ${move.to + 1}.`;
      pageIndex = pageContaining(
        buildRotatedView(themes, getState().currentIndex),
        move.to + 1,
      );
    } catch (err) {
      notice = `Failed to save the new order.\n> ${(err as Error).message}`;
    }

    await interaction.editReply(render());
  }
};
