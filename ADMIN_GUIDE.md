# Admin Guide

The bot automatically renames a designated channel on a weekly schedule, rotating through a list of themes. When the channel changes, it can also post an announcement message in that channel introducing the new theme.

## Commands

All commands are slash commands under `/theme-bot`. Type `/theme-bot` in any channel to see them.

| Command                     | Who can use it |
| --------------------------- | -------------- |
| `/theme-bot themes`         | Everyone       |
| `/theme-bot add-theme`      | Admins only    |
| `/theme-bot rotate-now`     | Admins only    |
| `/theme-bot reload-config`  | Admins only    |
| `/theme-bot config channel` | Admins only    |

---

### `/theme-bot themes`

Shows the next 5 upcoming themes in the rotation and which one is currently active. Useful for checking where you are in the cycle.

---

### `/theme-bot add-theme`

Opens a form where you can add a new theme to the rotation. You'll be asked for:

- **Theme Name** — This becomes the channel name. It'll be automatically lowercased and spaces will become hyphens (e.g. "Black and White" → `black-and-white`). Keep it short and descriptive.
- **Channel Message** — The message the bot posts in the channel when this theme becomes active. Supports Discord markdown (bold, italics, etc.).

The new theme is added to the end of the rotation queue.

---

### `/theme-bot rotate-now`

Immediately rotates to the next theme without waiting for the scheduled time. Use this if you want to kick off a new theme early or test that things are working. The bot will confirm which theme was applied.

---

### `/theme-bot reload-config`

Reloads the bot's configuration without needing a restart. Use this if the bot owner has made changes to the schedule or timezone settings and you need them to take effect right away.

---

### `/theme-bot config channel`

Opens a channel picker so you can choose which channel the bot renames each rotation. The current channel is pre-selected. Pick a new one and confirm — the change takes effect immediately for the next rotation.

> **Note:** You must have Administrator permission to use this command.

---

## Things to know

- **Rotation happens automatically** on the configured schedule (typically Monday mornings). You don't need to do anything for the weekly rotation to run.
- **Theme order is fixed** — themes rotate in the order they were added. Use `/theme-bot themes` to see what's coming up.
- **The bot needs the right permissions** — if it ever stops renaming the channel, check that it still has `Manage Channels` and `Send Messages` permissions in that channel.
- **Discord rate limits channel renames** to 2 per 10 minutes. The weekly schedule respects this, but avoid using `/theme-bot rotate-now` in quick succession.
