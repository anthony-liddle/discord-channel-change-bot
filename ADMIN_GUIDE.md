# Admin Guide

The bot automatically renames a designated channel on a weekly schedule, rotating through a list of themes. When the channel changes, it can also post an announcement message in that channel introducing the new theme.

## Commands

All commands are slash commands under `/theme-bot`. Type `/theme-bot` in any channel to see them.

| Command                      | Who can use it |
| ---------------------------- | -------------- |
| `/theme-bot themes`          | Everyone       |
| `/theme-bot add-theme`       | Admins only    |
| `/theme-bot edit-theme`      | Admins only    |
| `/theme-bot delete-theme`    | Admins only    |
| `/theme-bot reorder-themes`  | Admins only    |
| `/theme-bot rotate-now`      | Admins only    |
| `/theme-bot reload-config`   | Admins only    |
| `/theme-bot config channel`  | Admins only    |
| `/theme-bot config schedule` | Admins only    |

---

### `/theme-bot themes`

Shows the next 5 upcoming themes in the rotation and which one is currently active. Useful for checking where you are in the cycle.

---

### `/theme-bot add-theme`

Opens a form where you can add a new theme to the rotation. You'll be asked for:

- **Theme Name** — This becomes the channel name. It'll be automatically lowercased and spaces will become hyphens (e.g. "Black and White" → `black-and-white`). Accented letters lose their accents, so "Café Night" becomes `cafe-night`. Anything else that isn't a letter, number, hyphen or underscore is dropped. Up to 95 characters; keep it short and descriptive.
- **Channel Message** — The message the bot posts in the channel when this theme becomes active. Supports Discord markdown (bold, italics, etc.). Up to 2000 characters, which is Discord's own limit on a message.

After you submit, the bot tells you exactly what the channel will be renamed to, so you can check the result before the theme comes up.

The new theme is added to the end of the rotation queue.

**Names the bot will refuse:** a name that has no letters or numbers left after the rules above, such as one made only of emoji or only of punctuation. There would be nothing to rename the channel to, and the rotation would stop on that theme every week. Give it at least one letter or number. A name already used by another theme is refused too. That comparison is by the channel name the theme would produce, so "Cafe Night" and "Café Night" count as the same theme, and so do two names that differ only in capitals or spacing.

---

### `/theme-bot edit-theme`

Start typing after `theme:` and the bot suggests matching themes. You can type part of a name, or just the position number shown in `/theme-bot reorder-themes`. Pick a suggestion and a form opens, pre-filled with that theme's current values. You can update:

- **Theme Name** — Changing this renames the theme in the rotation. The same rules and limits as `add-theme` apply (lowercased, spaces → hyphens, accents dropped, up to 95 characters).
- **Channel Message** — The message posted when this theme becomes active. Up to 2000 characters.

As with `add-theme`, the bot shows you the channel name your edit will produce.

Changes take effect in the next rotation that uses this theme.

> **Pick a suggestion rather than typing a name and pressing enter.** The bot refuses anything that is not one of its own suggestions, and it also refuses if the theme list changed while you were typing. Both cases say so and change nothing, so you can just run the command again.

---

### `/theme-bot delete-theme`

Works the same way as `edit-theme`: start typing after `theme:` and pick one of the suggestions. You'll then be asked to confirm before anything is removed — this cannot be undone. The remaining themes stay in their current order.

---

### `/theme-bot reorder-themes`

Shows the numbered theme list and lets you move any theme to any position.

**How it works:**

1. The list appears with four buttons: **Previous**, **Next**, **Move** and **Done**.
2. Click **Move**. A short form asks which position to move and where to put it. Both numbers come from the list in front of you.
3. Submit, and the list redraws with the theme in its new place. The move is saved straight away.
4. Repeat as often as you like, then click **Done**.

Moving a theme from position 30 to position 3 is one **Move** and one form, the same as moving it one place. The distance does not matter and neither does how long the list is.

**Previous** and **Next** only exist for very long lists that do not fit in one Discord message. They change what you can see, never what you can move: positions are absolute, so you can move a theme that is on another page without going to it first. Around thirty themes still fits on a single page.

Because each move saves as it happens, there is no cancel-everything button. If you put something in the wrong place, move it back.

> **Note:** The bot keeps track of which theme is currently "up next" — reordering won't accidentally skip or repeat a theme mid-rotation, even if you move the current theme itself.

---

### `/theme-bot rotate-now`

Immediately rotates to the next theme without waiting for the scheduled time. Use this if you want to kick off a new theme early or test that things are working. The bot will confirm which theme was applied.

---

### `/theme-bot reload-config`

Reloads the bot's configuration without needing a restart. Use this if the bot owner has made changes to the timezone settings and you need them to take effect right away.

---

### `/theme-bot config channel`

Opens a channel picker so you can choose which channel the bot renames each rotation. The current channel is pre-selected. Pick a new one and confirm — the change takes effect immediately for the next rotation.

---

### `/theme-bot config schedule`

Opens a two-step picker to set when the weekly rotation runs:

1. **Pick a day** — choose the day of the week (e.g. Saturday)
2. **Pick a time** — choose the hour (e.g. 9:00 AM)

The current schedule is pre-selected so you can see what's configured. The change takes effect immediately — the next rotation will run at the new day and time.

> **Note:** All schedule times use the timezone configured by the bot owner (shown alongside the current schedule). To change the timezone, contact the bot owner.

---

## Things to know

- **Rotation happens automatically** on the configured schedule. You don't need to do anything for the weekly rotation to run.
- **Theme order** — themes rotate in the order they appear in the list. Use `/theme-bot themes` to see what's coming up, and `/theme-bot reorder-themes` to change the order.
- **The bot needs the right permissions** — if it ever stops renaming the channel, check that it still has `Manage Channels` and `Send Messages` permissions in that channel.
- **Discord rate limits channel renames** to 2 per 10 minutes. The weekly schedule respects this, but avoid using `/theme-bot rotate-now` in quick succession.
- **Theme name and message limits** are 95 characters for a name and 2000 for a message. The forms stop you going over rather than failing afterwards. The name limit leaves room for the position number the menus show in front of each theme.
- **If a scheduled rotation fails**, the bot posts about it in the admin channel, if the bot owner has configured one. A failed rotation does not skip the theme: the channel keeps its old name and the same theme is tried again on the next run, so nothing is lost from the queue.
