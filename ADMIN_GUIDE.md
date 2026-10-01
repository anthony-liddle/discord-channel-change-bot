# Admin Guide

The bot automatically renames a designated channel on a weekly schedule, rotating through a list of themes. When the channel changes, it posts an announcement in that channel introducing the new theme.

## What the announcement looks like

The announcement is the theme's name as a large heading, with the theme's message underneath:

```
# Weekly theme pottery
Show us what you made this week
```

The heading is there so that anyone scrolling back can tell which theme each announcement belonged to, after the channel has been renamed to the next one. The scheduled rotation and `/theme-bot rotate-now` post exactly the same thing.

**Theme names are now posted publicly as you type them.** Before this, a name reached the channel only as the channel name, lowercased and with punctuation stripped, unless someone looked it up with `/theme-bot themes`. Now it is posted to everyone in the channel exactly as written, capitals, punctuation, accents and all, as the heading of every announcement. Write names with that in mind. The heading uses the same name you see in `/theme-bot themes` and in the suggestions, with nothing added or removed.

Discord formatting in a name works inside the heading the same way it works in a message, so `Weekly theme *stars*` shows "stars" in italics. Check the result in the next announcement if you use it.

**Mentions never notify anyone.** An `@everyone`, `@here`, role or user mention in a theme name or message still shows in the post, but nobody is pinged. That holds for everything the bot posts, not just announcements. If a theme should ever ping a role, ask the bot owner: it has to be built in as a deliberate setting, not typed into a form.

A theme with no message posts its name heading on its own. The forms always ask for a message, so this normally only happens to an entry someone has added to `themes.json` by hand.

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

- **Theme Name**: This becomes the channel name. It'll be automatically lowercased and spaces will become hyphens (e.g. "Black and White" → `black-and-white`). Accented letters lose their accents, so "Café Night" becomes `cafe-night`. Anything else that isn't a letter, number, hyphen or underscore is dropped. It also heads the announcement exactly as you typed it, so everyone in the channel sees it that way. Up to 95 characters; keep it short and descriptive.
- **Channel Message**: The message the bot posts under the theme name when this theme becomes active. Supports Discord markdown (bold, italics, etc.). Up to 1902 characters. Discord will not post more than 2000 in one message, and the name heading above the message can take up to 98 of them.

After you submit, the bot tells you exactly what the channel will be renamed to, so you can check the result before the theme comes up.

The new theme is added to the end of the rotation queue.

**Names the bot will refuse:** a name that has no letters or numbers left after the rules above, such as one made only of emoji or only of punctuation. There would be nothing to rename the channel to, and the rotation would stop on that theme every week. Give it at least one letter or number. A name with a line break, a tab or another invisible control character in it is refused as well, because the name is posted as a one line heading and a line break would split it; the form's name box is single line, so this mostly comes from pasting. A name already used by another theme is refused too. That comparison is by the channel name the theme would produce, so "Cafe Night" and "Café Night" count as the same theme, and so do two names that differ only in capitals or spacing.

---

### `/theme-bot edit-theme`

Start typing after `theme:` and the bot suggests matching themes. You can type part of a name, or just the position number shown in `/theme-bot reorder-themes`. Pick a suggestion and a form opens, pre-filled with that theme's current values. You can update:

- **Theme Name**: Changing this renames the theme in the rotation, and changes the heading of its announcement to match, exactly as typed. The same rules and limits as `add-theme` apply (lowercased, spaces → hyphens, accents dropped, up to 95 characters).
- **Channel Message**: The message posted under the theme name when this theme becomes active. Up to 1902 characters.

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

**Position 1 cannot be moved into or out of.** It is the current rotation slot, which the rotation sets rather than reordering. Position 2 is the soonest a move can take effect, so that is where to put a theme you want up next. The bot refuses a move touching position 1 and says so rather than appearing to do nothing.

Because each move saves as it happens, there is no cancel-everything button. If you put something in the wrong place, move it back.

> **Note:** The bot keeps track of which theme is currently "up next" — reordering won't accidentally skip or repeat a theme mid-rotation, even if you move the current theme itself.

---

### `/theme-bot rotate-now`

Immediately rotates to the next theme without waiting for the scheduled time. Use this if you want to kick off a new theme early or test that things are working. It posts the same announcement the scheduled rotation would, and the bot will confirm which theme was applied.

If the channel has already been renamed twice in the last ten minutes, by the bot or by hand, Discord makes the rename wait its turn. The reply says so and roughly how long, then updates by itself when the rotation finishes, up to ten minutes later. There is no need to run it again; doing so only tells you a rotation is already in progress.

---

### `/theme-bot reload-config`

Reloads the bot's configuration without needing a restart. Use this if the bot owner has made changes to the timezone settings and you need them to take effect right away.

The reply also tells you three things you cannot see any other way:

- **The current files.** `themes.json`, `state.json` and `config.json` are attached. These live on the machine the bot runs on and nowhere else, so this is how you get a copy of them.
- **Anything wrong with the theme list.** A name that could never become a channel name, a name that is too long, a message over the limit, or two themes that would rename the channel to the same thing. Each is reported with its position in the list.
- **Whether the alert channel works.** The bot posts a test line to it and reports what happened. See below.

The reply is only visible to you.

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
- **Discord rate limits channel renames** to 2 per 10 minutes, and renames done by hand count. The weekly schedule respects this, but avoid using `/theme-bot rotate-now` in quick succession. If you do run into it, see `rotate-now` above: the bot waits and finishes by itself.
- **Theme name and message limits** are 95 characters for a name and 1902 for a message. The forms stop you going over rather than failing afterwards. The name limit leaves room for the position number shown in front of each theme, both in the autocomplete suggestions and in the `reorder-themes` list. The message limit leaves room for the name heading: Discord will not post more than 2000 characters in one message, and the heading can take up to 98.
- **If a scheduled rotation fails**, the bot posts about it in the admin channel, if the bot owner has configured one. A failed rotation does not skip the theme: the channel keeps its old name and the same theme is tried again on the next run, so nothing is lost from the queue.
- **The bot also posts a line on every successful rotation**, so the admin channel gets a message every week either way. That is deliberate: it means silence is evidence that something is wrong rather than something you have to interpret, and it re-proves every week that the alert channel still works. The bot owner can turn the weekly success line off without turning failure alerts off with it.
- **Checking the alert channel** is what `/theme-bot reload-config` does. It posts a test line and tells you whether it arrived. An alert channel the bot cannot post in is worse than none, because it gets relied on, so it is worth running after any permission change. It also warns if the alert channel has been set to the same channel the bot renames, which would put every alert and weekly notice in front of the whole server.
