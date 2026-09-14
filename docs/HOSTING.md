# Hosting Runbook

How to move this bot onto infrastructure you control, from a standing start.

Written for someone who has never deployed anything. Terms are explained the
first time they appear. Follow it in order. Every step says what success looks
like, and where a step can plausibly go wrong it says what to check instead of
assuming.

**Nothing here touches the live server until Part 7.** Parts 1 through 6 are all
preparation, and all of them are reversible.

## Contents

1. [Before You Start](#1-before-you-start)
2. [Which Branch You Are On](#2-which-branch-you-are-on)
3. [Decisions To Make First](#3-decisions-to-make-first)
4. [Creating The Discord Application](#4-creating-the-discord-application)
5. [Building The Theme Files](#5-building-the-theme-files)
6. [Testing On Your Own Server](#6-testing-on-your-own-server)
7. [Deploying To Fly](#7-deploying-to-fly)
8. [Cutover](#8-cutover)
9. [Rollback](#9-rollback)
10. [What You Now Own](#10-what-you-now-own)
11. [Appendix A: Reading The Logs](#appendix-a-reading-the-logs)
12. [Appendix B: What pnpm register Does](#appendix-b-what-pnpm-register-does)

---

## 1. Before You Start

### Why This Is Happening

The bot runs on a machine belonging to someone outside the admin team. You own
the repository and nothing else. A canary marker merged to `main` never reached
the running bot, while the bot itself kept answering commands, which means the
machine is up and the deploy is not automated. You cannot ship code to this bot,
so PR #55, which fixes the broken edit and delete commands, cannot ship either.

Moving hosts is the unblock. It is not an improvement project.

### What You Need

- A Discord account with admin on the target server. You have this.
- A payment card. The recommended host costs a few dollars a month.
- This repository checked out locally, with `pnpm install` already run.
- About two hours for the first pass, most of it reading and clicking.

### Vocabulary

Four terms are used throughout and are worth pinning down now.

- **Discord application**: the registration in Discord's developer portal that
  owns a bot. It holds the bot token and the list of slash commands. One
  application, one bot identity.
- **Bot token**: the password for the bot. Anyone holding it can act as the bot.
  It never goes in the repository.
- **Ephemeral filesystem**: a disk that is thrown away and rebuilt every time you
  deploy. Most beginner-friendly hosts give you one by default. This bot stores
  its entire state in files, so an ephemeral filesystem would silently erase the
  theme list on every deploy.
- **Volume** (also called a disk): storage that survives a deploy. This is the
  single constraint that decides which host to use.

---

## 2. Which Branch You Are On

Everything downstream depends on one fact: who owns the Discord application.

**Check it now. It costs nothing.**

1. Go to <https://discord.com/developers/applications>.
2. Log in with your ordinary Discord account. The developer portal is not a
   separate account, it is the same login you already use.
3. Look at the list of applications.

**If the theme bot is listed, you are on Branch A.** You own the application and
the token.

**If the list is empty, or the bot is not in it, you are on Branch B.** The
application belongs to her. This is the expected outcome, since you have never
logged into this portal before.

### What Each Branch Means

**Branch A.** You hold the token. You can point your own host at the existing
bot identity. Members see no change at all: same bot name, same avatar, same
member list entry. The cutover lever is resetting the token, which instantly
invalidates the copy on her machine and stops her instance dead.

The catch: **resetting the token is not reversible.** Once you do it, her
instance is down and cannot be brought back. So under Branch A, everything else
must already be working before you touch the token. The token reset is the last
step, not the first.

**Branch B.** You own nothing but source code. You create a new application, a
new bot, and a new invite. You cannot stop her instance at all. Your only lever
is removing her bot from the server, which you can do as a server admin, and
which is sufficient (see [Part 8](#8-cutover)).

The upside of Branch B, and it is a real one: **you finally control
`pnpm register`.** The command surface stops being frozen. New subcommands and
new command options become possible for the first time.

Branch B is the assumed path below. Branch A differences are called out inline
and are always simpler, never harder.

---

## 3. Decisions To Make First

### 3.1 Which Host

The bot needs one always-on Node process holding an outbound connection to
Discord, plus three small JSON files that must survive a deploy. It listens on
no port and serves no web traffic.

That file requirement is what rules most options out. Free tiers on beginner
platforms almost universally give you an ephemeral filesystem, which would reset
the theme list to nothing on every push.

|                             | **Fly.io** (recommended)                         | Render                                        | A plain VPS                                      |
| --------------------------- | ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------ |
| Files survive a deploy      | Yes, volume mounted at `/data`                   | Yes, persistent disk                          | Yes, it is just a filesystem                     |
| Rough cost per month        | About 3 dollars                                  | About 7 dollars and up                        | About 5 dollars                                  |
| Read the logs               | `fly logs`                                       | Dashboard, in the browser                     | `journalctl -u theme-bot`                        |
| Restart it at 11pm          | `fly apps restart`                               | Button in the dashboard                       | `systemctl restart theme-bot`                    |
| Read `themes.json` directly | `fly ssh console` then `cat`                     | Shell, on paid plans                          | `ssh` then `cat`                                 |
| Operational surface         | Low. No operating system to maintain             | Lowest. Almost all clicking                   | Highest. You own OS patching, firewall, SSH keys |
| Main risk                   | Running more than one machine would rotate twice | Costs more, and more of it is hidden from you | Security patching is now your job                |

**Recommendation: Fly.io.**

The deciding factor is not price. It is that `fly ssh console` lets you open a
shell on the running bot and read `themes.json` with your own eyes. The entire
history of this project has been an inability to see that file. Buying that
capability permanently is worth more than the couple of dollars a month.

**What you trade away.** You learn a command line tool and a little of Fly's
machine model rather than clicking around a dashboard. And you must never run
more than one machine: two instances would both fire the weekly cron, renaming
the channel twice and posting the announcement twice. `fly.toml` says this in a
comment and [Part 10](#10-what-you-now-own) says how to check.

**If you would rather click than type**, Render is the honest second choice.
Attaching a disk there forces the instance count to one, which structurally
prevents the double-rotation problem rather than relying on you to remember. It
costs more and shows you less.

**If "boring and recoverable" means "no platform magic at all"**, a VPS is the
most transparent option and the files are just files. It is also the most work,
and OS security updates become a recurring obligation you did not have before.

> Prices and free allowances on all three change regularly. Treat the numbers
> above as the right order of magnitude, not a quote, and check current pricing
> before you commit.

Scaffolding in this PR (`Dockerfile`, `fly.toml`, `.dockerignore`) is for Fly
only, as instructed. Nothing was scaffolded for the options not recommended.

### 3.2 Where To Set The Rotation

**Do not copy the old `currentIndex`. It is the one value known to be wrong.**

The stored index has disagreed with the channel before, and announcement history
shows the rotation itself works, so **the channel name is the trustworthy signal
and the stored index is not.**

**The rule: set `currentIndex` to the position of whatever the channel is
actually named at the moment you cut over.** Read the channel name, look it up
in the theme list, use that number.

**The rotation table lives in `docs/THEME-LIST.md`, which is gitignored.** It
maps each `currentIndex` to a theme name and the channel name that theme
produces. It is deliberately not in this file: this repository is public and the
theme list is a private community's content.

`currentIndex` is zero-based, so the first entry is 0 and the last is one less
than the number of entries.

**Work the number out at cutover, like this:**

1. **Read the channel's current name.**
2. **Find it in `docs/THEME-LIST.md`.**
   - **It matches an entry.** Use that entry's `currentIndex`. Done.
   - **It matches nothing.** Someone renamed the channel by hand. The name is no
     longer evidence of where the rotation sits, and what you have is a decision
     rather than a lookup. Go to
     [section 3.4](#34-resyncing-after-a-manual-change).
3. **Write down what the next rotation will do.** The bot advances before it
   renames, so it applies the entry one row further down the list, wrapping from
   the last row back to 0. Check that against what the admin team expects before
   you start.

> **No worked number is given here on purpose.** This value has gone stale three
> times in two days: every Monday rotation moves it, and a manual rename
> invalidates it outright. Derive it at cutover from what the channel actually
> says, never from a number written in a document.

**The deadline is Monday 2026-09-07 at 8:00 AM**, when the old bot fires again
and changes the answer.

### 3.3 The Announcement Messages

Each theme can carry an announcement posted when it becomes active. Most were
recovered from channel history, and the current status of each is recorded in
`docs/THEME-LIST.md` alongside the rotation table.

> **The message text is not in this repository and must not be added to it.**
> This repo is public and the announcements are a private community's content.
> They are kept locally. Paste them into `themes.json` when you seed the volume,
> never into anything tracked by git.

Two things are outstanding, both recorded in `docs/THEME-LIST.md`:

- **One entry has no announcement text at all.** It has never rotated, so none
  has ever existed and someone has to write one.
- **One entry's name is spelled two different ways**, once in the list the bot
  holds and once by a mod who renamed the channel by hand. `themes.json` can
  hold only one of them, and the choice has a visible consequence: match the mod
  and the next rotation of that entry is a no-op rename, per
  [section 3.4](#34-resyncing-after-a-manual-change); match the list and members
  watch the channel name change. Decide it before you seed the file.

**On recovering announcement text in future: copy by hand, do not build a
scraper.**

The reasoning: reading message history from code requires the Message Content
privileged intent, which is a toggle you would have to enable on the application
and a permission you would then be carrying forever, for a job you do exactly
once. Discord's own search does the same work in about twenty minutes. In the
channel, search `from:` and pick the bot, and the announcements come back in
order.

**None of this is blocking.** `message` is optional in the data format. A theme
with an empty message renames the channel and posts nothing, which fails safe.
So you can cut over with a blank and fill it in later. Once PR #55 lands,
`/theme-bot edit-theme` works and you can do it from inside Discord without
touching the file again.

---

### 3.4 Resyncing After A Manual Change

Anyone with Manage Channels can rename the channel, and on 2026-08-31 someone
did. The morning rotation applied one theme, then a mod renamed the channel to a
different theme and posted their own announcement, because the broken edit
command left them no other way to run the theme they wanted. The specifics are
in `docs/THEME-LIST.md`.

**That is the second recorded manual override.** Treat it as something that will
happen again rather than a one-off, and expect to do this more than once.

**What it breaks.** The rule in [3.2](#32-where-to-set-the-rotation) reads the
rotation position off the channel name. A hand-rename severs that link. The name
now records what a person wanted this week, not where the bot's rotation sits,
so looking it up in the theme list returns nothing.

#### Finding Where The Rotation Actually Is

With the channel name unusable, in rough order of directness:

1. **`/theme-bot themes`.** The entry marked `(current)` is
   `themes[currentIndex]` read straight from `state.json`. This is the bot's own
   answer. It has been wrong on this server before, so corroborate it rather
   than trusting it alone.
2. **Announcement history.** Search the channel for messages from the bot,
   newest first. The most recent one names the last theme the bot believed it
   applied. Filtering by author matters here: a mod's manual announcement is
   posted by a person, so author is what separates a real rotation from a
   hand-run one.
3. **Server audit log.** Channel update entries name who renamed the channel and
   when, which distinguishes a bot rename from a human one directly. Retention
   is around 45 days.

Two agreeing sources is enough. **If `/theme-bot themes` disagrees with the last
bot announcement, trust the announcement**, because it is evidence of what
happened rather than a stored number that has drifted before.

#### Choosing The Index

Knowing where the rotation was does not tell you where it should resume. That is
a community decision with two defensible answers.

**Option A: resume where the rotation actually was.** Set `currentIndex` to the
last theme the _bot_ applied. The manual change is treated as a one-week detour
the rotation ignores.

The cost: the theme the mod ran by hand returns to the back of the queue and
does not come round again for a full cycle, even though members have just seen
it and someone wrote an announcement for it.

**Option B: treat the manual theme as having taken its turn.** Set
`currentIndex` to the entry the mod ran. The rotation accepts the override and
continues from there.

The cost: the theme the bot applied that morning runs again next week, having
been live only a few hours before it was overridden.

`docs/THEME-LIST.md` records both index values for the current situation, along
with what each one renames the channel to next.

**This is your call and the admin team's, not a technical one.** Both are a
single number in `state.json` and neither is harder to implement. Decide it
before cutover, because the value you seed is the decision.

#### The One Case Where A Manual Change Costs Nothing

If the channel already carries the name the rotation is about to apply, the bot
notices and skips the API call:

```
Channel already named "weekly-theme-example", skipping rename
```

The index still advances, no rename is spent against the two-per-ten-minutes
limit, and members see nothing change. So a manual rename that happens to match
the next scheduled theme is free. One that does not match will be overwritten by
the next rotation, which is what renaming the channel mid-week should be
expected to mean.

**This is also the lever for making a manual name stick.** Set the entry's
`name` so it normalizes to exactly what is on the channel, then point
`currentIndex` at the row _before_ it. The next rotation applies a name the
channel already has, the rename is skipped, and nothing visibly changes.

---

## 4. Creating The Discord Application

**Branch A: skip this entire part.** You already have an application. Go to
[Part 5](#5-building-the-theme-files). Your only task here is to know that your
token reset happens later, in [Part 8](#8-cutover), and not before.

### 4.1 Accuracy Of The README

`README.md` has setup steps, but it has drifted. Before you follow it, here is
what is still true and what is not.

**Still accurate:**

- Creating the application and finding the bot token. Section 1, steps 1 to 6.
- No privileged gateway intents are needed. Correct, and worth keeping true.
- The OAuth2 URL Generator flow and the three permissions. Section 2.
- Getting a channel ID via Developer Mode and right-click. Section 3.
- The cron schedule format and examples. Section 3.
- The install and run commands. Section 4.

**Stale, do not trust:**

- **The Slash Commands table is wrong.** It lists a flat `/themes`,
  `/add-theme`, `/rotate-now`, `/reload-config`. The real surface is a single
  `theme-bot` command with subcommands: `/theme-bot themes`,
  `/theme-bot add-theme`, `/theme-bot edit-theme`, `/theme-bot delete-theme`,
  `/theme-bot reorder-themes`, `/theme-bot rotate-now`,
  `/theme-bot reload-config`, `/theme-bot config channel`, and
  `/theme-bot config schedule`. `ADMIN_GUIDE.md` is current and correct; use
  that instead.
- **The `themes.json` example is misleading.** It shows names already in
  channel format (`weekly-movies`). Real names are human readable
  (`Weekly theme one`) and the bot converts them. Use `themes.example.json`
  for the shape and `docs/THEME-LIST.md` for the real values.
- **The File Structure section** predates several commands.
- **Nothing in the README mentions `DATA_DIR`**, which is new in this PR and
  required on any host with a mounted volume.

### 4.2 Create The Application

1. Go to <https://discord.com/developers/applications>.
2. Top right, click **New Application**.
3. Name it. This name is what members see in the member list and next to slash
   commands. If you want the change to be invisible, match the current bot's
   name exactly. If you would rather members know it moved, pick something new.
4. Accept the terms and click **Create**.

Success: you land on a General Information page for your new application.

### 4.3 Set The Identity Members Will See

Still on **General Information**:

1. Upload an **App Icon**. This becomes the bot's avatar. To match the current
   bot, right-click its avatar in Discord, open the image, and save it first.
2. Save changes.

### 4.4 Create The Bot User

1. Left sidebar, click **Bot**.
2. Newer versions of the portal create the bot user automatically. If you see a
   **Add Bot** or **Reset Token** button, the bot already exists. If there is an
   **Add Bot** button, click it and confirm.
3. **Privileged Gateway Intents**: leave all three off. This bot needs none of
   them, and leaving them off means you never have to justify them to Discord.
4. **Public Bot**: turn this **off**. It stops anyone else adding your bot to
   their server.

Success: the Bot page shows your bot's username and a Reset Token button.

### 4.5 Get The Token And Client ID

**Do not paste either of these into the repository, into a chat, or into any
file tracked by git.** They go in two places only: your local `.env`, which is
already gitignored, and Fly's secret store.

1. On the **Bot** page, click **Reset Token**, confirm, and copy the value. This
   is `DISCORD_TOKEN`. It is shown once. If you lose it, reset again.
2. Left sidebar, **OAuth2**, then **General**. Copy the **Client ID**. This is
   `CLIENT_ID`. It is not secret, but keep it with the token for convenience.
3. Locally:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and paste both values in.

Success: `.env` has both values, and `git status` does not list `.env`.

### 4.6 Build The Invite Link

Do not use this link yet. You are only generating it.

1. Left sidebar, **OAuth2**, then **URL Generator**.
2. Under **Scopes**, tick **`bot`** and **`applications.commands`**. Both are
   required: the first adds the bot to a server, the second lets it register
   slash commands.
3. Under **Bot Permissions**, tick exactly these three:
   - **View Channels**
   - **Send Messages**
   - **Manage Channels**
4. Copy the generated URL at the bottom. Save it somewhere; you will use it
   twice, once for your test server and once at cutover.

> Manage Channels is the permission that allows renaming. It is broad, and it
> applies server-wide when granted this way. If the admin team would rather it
> were scoped, you can grant the bot no server-wide permissions and instead add
> a channel-level permission overwrite on the one channel it renames. That is
> tighter and slightly more fiddly. Either works.

---

## 5. Building The Theme Files

The bot reads three files. On Fly they live on the volume at `/data`. Build them
locally first so you can test with them.

```bash
mkdir -p ~/theme-bot-data
cp themes.example.json ~/theme-bot-data/themes.json
cp config.example.json ~/theme-bot-data/config.json
echo '{"currentIndex":N}' > ~/theme-bot-data/state.json   # replace N, see below
```

Then edit each one.

**`themes.json`.** Fourteen entries, already deduplicated and in rotation order.
Fill in the `message` fields from channel history per
[section 3.3](#33-the-announcement-messages). An empty message means the rename
happens and nothing is posted, so blanks are safe but silent.

**`config.json`.** Three fields:

```json
{
  "channelId": "paste the channel ID here",
  "schedule": "0 8 * * 1",
  "timezone": "America/Los_Angeles"
}
```

- `channelId`: enable Developer Mode in Discord (User Settings, Advanced,
  Developer Mode), then right-click the channel and Copy Channel ID.
- `schedule` and `timezone`: **verify these against reality rather than copying
  mine.** Announcement history shows rotations landing at 8:00 AM. The values
  above encode Monday 8:00 AM Pacific. I do not know what her `config.json`
  actually contains, and the code's built-in defaults are `0 9 * * 1` in
  `America/New_York`, which would be 6:00 AM Pacific and does not match what you
  observed. Set what you want and confirm it against the first rotation.

> **`timezone` here is what schedules the rotation.** The `TZ = "UTC"` setting
> in `fly.toml` is unrelated and only affects how timestamps are printed in the
> logs. If a rotation fires at the wrong hour, change `timezone` in
> `config.json`, not `TZ`.

**`state.json`.** One field, `currentIndex`, and it is the only value in these
three files that is a judgement call rather than a fact. Derive it at cutover
with the procedure in [section 3.2](#32-where-to-set-the-rotation). If the
channel name matches no entry because someone renamed it by hand, it is a
decision instead, and [section 3.4](#34-resyncing-after-a-manual-change) lays
out the two options. Do not leave the literal `N` in the file.

Success: all three files parse. Check with:

```bash
for f in themes state config; do
  node -e "JSON.parse(require('fs').readFileSync('$HOME/theme-bot-data/$f.json','utf8'));console.log('$f.json ok')"
done
```

---

## 6. Testing On Your Own Server

This is the part that has never been possible on this project. Do not skip it.

The goal: reproduce the original edit-theme bug on `main`, then watch PR #55 fix
it, without any of it touching the real server.

### 6.1 Create A Test Server

1. In Discord, click the **+** at the bottom of the server list.
2. **Create My Own**, then **For me and my friends**.
3. Name it anything. You are the only member.
4. Create a text channel in it. Name does not matter, the bot will rename it.
5. Right-click that channel, **Copy Channel ID**.

### 6.2 Use A Throwaway Application

Do not point your test at the real bot application. Repeat
[Part 4](#4-creating-the-discord-application) to create a second application,
named something like `theme-bot-test`. It costs nothing and keeps the two
identities completely separate.

Invite it to your test server with the URL generator link from
[section 4.6](#46-build-the-invite-link).

### 6.3 Seed Data That Reproduces The Bug

The original bug needs a duplicate theme name. Build a scratch data directory
with one:

```bash
mkdir -p /tmp/theme-bot-test
cat > /tmp/theme-bot-test/themes.json <<'JSON'
{
  "themes": [
    { "name": "Weekly theme one", "message": "First theme." },
    { "name": "Weekly theme two", "message": "Second theme." },
    { "name": "Duplicate Name", "message": "First copy." },
    { "name": "Duplicate Name", "message": "Second copy." }
  ]
}
JSON
echo '{"currentIndex":0}' > /tmp/theme-bot-test/state.json
cat > /tmp/theme-bot-test/config.json <<'JSON'
{
  "channelId": "PASTE_TEST_CHANNEL_ID",
  "schedule": "0 8 * * 1",
  "timezone": "America/Los_Angeles"
}
JSON
```

Edit `config.json` and paste your test channel ID.

Put the **test** application's token and client ID in `.env`.

> `DATA_DIR` is what keeps this scratch data separate from your real files. It
> is the same mechanism the deployed bot uses, so testing this way also proves
> the mechanism works.

### 6.4 Watch It Fail On main

```bash
git checkout main
pnpm install
pnpm build
pnpm register                     # registers commands on the TEST application
DATA_DIR=/tmp/theme-bot-test pnpm start
```

The terminal should print `Logged in as ...` and `Bot is ready!`.

In your test server, run `/theme-bot edit-theme`.

**Expected failure: "The application did not respond".** That is the original
bug, reproduced on demand for the first time. Your terminal shows the real
exception, which nobody has ever been able to see.

Also try `/theme-bot delete-theme`. It fails the same way, for the same reason.

Stop the bot with `Ctrl+C`.

### 6.5 Watch It Pass On The Fix

```bash
git checkout fix/theme-picker-index-resolution
pnpm build
DATA_DIR=/tmp/theme-bot-test pnpm start
```

Run `/theme-bot edit-theme` again.

**Expected: a picker appears**, listing four numbered entries, with the two
duplicates distinguishable as `3. Duplicate Name` and
`4. Duplicate Name`. Pick number 4, rename it, submit. Then run
`/theme-bot reorder-themes` and confirm entry 4 changed and entry 3 did not.

That is PR #55 verified against a real Discord server before it goes anywhere
near the real one.

> No `pnpm register` is needed between the two branches. Neither changes the
> command surface.

### 6.6 Testing Rotations, And The Rate Limit

**Discord allows two channel renames per ten minutes.** Exceed it and further
renames are refused until the window clears, which is easy to trip while
testing and annoying to wait out.

Practical rules:

- `/theme-bot rotate-now` renames immediately. Budget two, then wait ten
  minutes.
- A rotation where the channel already has the target name logs
  `Channel already named "x", skipping rename` and costs nothing, because the
  bot skips the API call entirely.
- If you do hit the limit, `/theme-bot rotate-now` reports the failure back to
  you in Discord and your terminal shows a `429` status. Wait it out. Nothing is
  broken.

---

## 7. Deploying To Fly

Nothing in this part touches the real server. The bot will be running, but it
will not be in the real Discord server yet, so it can rename nothing.

### 7.1 Install And Sign In

```bash
brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
fly auth signup            # or: fly auth login
```

You will be asked for a payment card. Success: `fly auth whoami` prints your
email.

### 7.2 Create The App

From the repository root. Back up the config first, because `fly launch`
rewrites `fly.toml` and the two blocks it may drop are the ones that keep your
data alive:

```bash
cp fly.toml fly.toml.bak
fly launch --no-deploy
```

Answer the prompts:

- **App name**: pick one. It must be globally unique. Write it down.
- **Region**: pick from the list Fly offers you. `sjc` is San Jose, the
  closest to the Pacific Northwest that is reliably available. Write it down,
  because the volume has to be created in the same region.
- **Postgres / Redis / other databases**: **no** to all. This bot uses files.
- **Deploy now**: **no**. The volume does not exist yet.

`fly launch` will notice the existing `fly.toml` and may offer to overwrite it.
**Keep the existing one.** If it rewrites it anyway, diff against your backup:

```bash
diff fly.toml.bak fly.toml
```

Two things to check, and both have actually happened:

**1. `[mounts]` and `[env]` must still be there.** They are what make the state
persist. Losing either silently wipes the theme list on every deploy.

**2. Delete any `[http_service]` block it added.** `fly launch` assumes it is
configuring a website and writes one in. This bot is a worker that listens on no
port, and that block breaks it in a way that looks like nothing is wrong:

```toml
[http_service]           # delete all of this
  internal_port = 3000
  auto_stop_machines = 'stop'
  min_machines_running = 0
```

`auto_stop_machines` with `min_machines_running = 0` tells Fly to stop the
machine when no HTTP requests arrive. None ever will, so Fly stops it and the
weekly rotation never fires again. `internal_port` also aims health checks at a
port nothing is listening on. With no services defined at all, Fly has nothing
to idle and the machine runs continuously, which is what a worker needs.

### 7.3 Create The Volume

The volume is the persistent disk. One gigabyte is far more than this bot will
ever need and is the smallest useful size.

```bash
fly volumes create theme_bot_data --size 1 --region sjc
```

The name must match `source` in `fly.toml`, and **the region must match the
region you chose in 7.2**. A volume in a different region to the machine cannot
be mounted, and the machine will fail to start. Substitute your region if it is
not `sjc`; check with `fly status`, which prints the machine's region.

Success: `fly volumes list` shows one volume.

### 7.4 Set The Secrets

```bash
fly secrets set DISCORD_TOKEN=paste_the_token_here
fly secrets set CLIENT_ID=paste_the_client_id_here
```

These are stored by Fly and injected as environment variables. They are never in
the repository, never in `fly.toml`, and never in the image.

> If your shell keeps history, prefix each command with a space, or clear the
> history afterwards, so the token is not left in `~/.zsh_history`.

Success: `fly secrets list` shows both names with digests, never the values.

### 7.5 Deploy

```bash
fly deploy
```

This builds the Dockerfile and starts one machine.

**`fly deploy` will report success. Do not trust it.** Fly considers a deploy
successful once the machine starts, and does not care whether your process
exited a second later. The only way to know what happened is the log:

```bash
fly logs -a <your-app-name> --no-tail
```

**Expected on this first run: the bot crash-loops.** `/data` is empty, so there
is no `config.json`, and you will see this repeating every few seconds:

```
Error: config.json not found. Please create it from config.example.json
INFO Main child exited normally with code: 1
```

That is correct behaviour and the next step fixes it. What you should not see is
silence: no log lines at all means the machine never started.

Check `fly status` too. If it says `stopped` rather than `started`, an
`[http_service]` block survived into your `fly.toml` and Fly has idled the
machine. Go back to 7.2 and remove it, because **you cannot seed a stopped
machine**: `fly ssh` and `fly ssh sftp` both fail with
`app <name> has no started VMs`.

### 7.6 Seed The Volume

This is the chicken-and-egg step, and it is sharper than it sounds: the volume
only exists once the app is deployed, but the app will not stay running long
enough to be seeded until the volume has files on it.

**Read this before you start, because the obvious approach deadlocks.**

After 7.5 the machine is crash-looping on the missing `config.json`. Fly retries
it ten times and then gives up:

```
machine has reached its max restart count of 10
```

At that point `fly status` shows `stopped`, and **a stopped machine cannot be
seeded**. Both of these fail:

```
Error: app <name> has no started VMs.
```

So the interactive `fly ssh sftp shell` in the obvious version of this step
cannot connect, and you are stuck.

**The way through: `config.json` is the only file that gates startup.** Land
that one file and the bot boots and stays up, after which the other two are
easy. Starting the machine resets the restart counter and gives you a window of
roughly twelve seconds per cycle, which is plenty for one small upload.

Use the non-interactive `fly ssh sftp put` rather than the shell, so it can be
retried in a loop:

```bash
D=~/theme-bot-data
fly machine start <machine-id> -a <your-app-name>

for i in $(seq 1 15); do
  if fly ssh sftp put "$D/config.json" /data/config.json -a <your-app-name>; then
    echo "landed on attempt $i"; break
  fi
  sleep 4
done
```

Get `<machine-id>` from `fly status`. In practice this lands on the first
attempt. Once it does, the machine stops crashing and the remaining two uploads
need no retry loop at all:

```bash
fly ssh sftp put "$D/themes.json" /data/themes.json -a <your-app-name>
fly ssh sftp put "$D/state.json"  /data/state.json  -a <your-app-name>
```

**Upload files rather than typing them into a container shell.** You already
built and validated them in [Part 5](#5-building-the-theme-files), and uploading
sidesteps shell quoting entirely.

> This matters more than it looks. Typing JSON into a remote shell is where this
> goes wrong: `echo {"currentIndex":0} > /data/state.json` looks correct and
> actually writes `{currentIndex:0}`, because the shell strips the quotes. The
> bot cannot parse that, falls back to index 0, and renames the channel to the
> wrong theme without ever reporting an error. Upload files you have already
> checked.

Validate all three locally before uploading any of them:

```bash
for f in themes state config; do
  node -e "JSON.parse(require('fs').readFileSync('$HOME/theme-bot-data/$f.json','utf8'));console.log('$f.json ok')"
done
```

> **Only `config.json` is actually required to boot.** A missing `themes.json`
> logs an error and leaves the bot with no themes. A missing `state.json` throws
> nothing at all and silently starts the rotation at index 0. That is a trap
> worth knowing: 0 is also one of the candidate values in the index decision, so
> "I forgot to upload state.json" and "I deliberately chose 0" produce identical
> behaviour and identical logs. Upload it explicitly even when the value you
> want is 0.

Read them back to confirm all three arrived intact:

```bash
fly ssh console -C "cat /data/state.json"
fly ssh console -C "cat /data/config.json"
fly ssh console -C "head -c 200 /data/themes.json"
```

Then restart so the bot picks them up:

```bash
fly apps restart
```

Success: `fly logs` shows `Logged in as ...`, then
`Permissions validated for channel: ...` or a permissions warning, then
`Current theme index:` with the number you set, then `Bot is ready!`.

**The read-back is the proof. The log line is only corroboration.** When
`state.json` will not parse, the bot falls back to index 0 and logs a warning
rather than an error. Since 0 is also a perfectly legitimate value to seed,
`Current theme index: 0` on its own cannot tell a correctly seeded 0 from a file
that was silently discarded. Check in this order:

1. **`cat /data/state.json` returned exactly the JSON you uploaded**, quotes
   intact. This is the proof. If it shows anything else, re-upload before going
   any further.
2. **No `Warning: Could not parse state.json` line appears in the logs.** That
   warning is the unambiguous signal and it is the thing to grep for. It means
   the file was unreadable no matter what index is reported afterwards.
3. **`Current theme index:` matches the number in the file you just read back.**
   If the file is right and the log disagrees, the bot did not reload. Restart
   it again.
4. **`config.json must contain a valid "channelId" string`** in the logs means
   `config.json` is malformed or the channel ID is missing. The deploy
   succeeded; the file is wrong. Re-upload it.

> A permissions warning here is expected and correct under Branch B, because the
> new bot is not in the real server yet, so it cannot see the channel. It stops
> once you invite it at cutover.

Verify the files are really there and really persistent:

```bash
fly ssh console -C "cat /data/themes.json"
fly deploy                                    # deploy again
fly ssh console -C "cat /data/themes.json"    # must be identical
```

**That second `cat` is the whole point of the volume.** If the file is gone
after a deploy, stop. The `[mounts]` block or `DATA_DIR` is wrong, and cutting
over would lose the theme list.

---

## 8. Cutover

Everything up to here was reversible and invisible. This part is neither.

**Pick a time far from Monday 8:00 AM**, so a scheduled rotation cannot fire
mid-cutover.

### 8.1 The Problem You Cannot Solve Directly

Under Branch B, **you cannot stop her instance.** It is a process on a machine
you have no access to, and it will keep running until she stops it.

**Your only lever is removing the bot from the server, and it is sufficient.**
Once the bot is no longer a member, it loses access to the channel entirely. Its
rename attempts fail with a permissions or unknown-channel error, and its
announcements have nowhere to post. It cannot affect the server again.

**What that looks like to members:**

- The bot disappears from the member list.
- Its old messages **stay** in channel history. Removing a bot does not delete
  what it posted.
- Its slash commands disappear from the picker for that server.
- If the server has join and leave system messages enabled, a "left the server"
  line may appear in the system channel.
- She will start accumulating errors on her side forever. That is not your
  problem to fix, but it is a courtesy to tell her she can shut it down.

**Branch A instead:** you do not remove anything. You reset the token in the
developer portal, which invalidates her copy instantly, then set the new token
as a Fly secret and restart. Members see nothing at all. Note the asymmetry:
under Branch A the cutover is irreversible from the first second, which is why
it goes last.

### 8.2 The Ordered Steps

1. **Write down the channel's current name.** Exactly as it appears. This
   decides `currentIndex`.

2. **Correct `state.json` on the volume** to match, using the table in
   [section 3.2](#32-where-to-set-the-rotation). Edit it on your own machine,
   validate it, then upload. Do not type JSON into a container shell, for the
   reason given in [section 7.6](#76-seed-the-volume).

   ```bash
   echo '{"currentIndex":N}' > ~/theme-bot-data/state.json   # replace N first
   node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/theme-bot-data/state.json','utf8')))"
   ```

   Then `fly ssh sftp shell`, and at the `sftp>` prompt:
   `put ~/theme-bot-data/state.json /data/state.json`, then `exit`.

   ```bash
   fly ssh console -C "cat /data/state.json"
   fly apps restart
   ```

   Confirms, in this order: **the `cat` returns exactly the JSON you uploaded**,
   and then the logs show `Current theme index:` matching it with **no**
   `Warning: Could not parse state.json` line anywhere. The read-back is the
   proof. The reported number cannot stand alone, because 0 is what the bot
   falls back to when the file is unreadable, and 0 is also a legitimate value
   to seed, so the number alone cannot tell the two apart. See
   [section 7.6](#76-seed-the-volume).

3. **Prove rollback exists before you break anything.** Re-inviting her bot
   needs two things that are not verified yet: her application's client ID, and
   her bot being marked **Public**. If Public Bot is off, only she can add it
   back, and removing it becomes irreversible for you.

   Test it without committing to anything:

   - Enable Developer Mode in Discord (User Settings, Advanced).
   - Right-click the old bot in the member list, **Copy User ID**. For a bot,
     the user ID and the application ID are the same number.
   - Build this URL with that number and **load it without clicking Authorize**:

   ```
   https://discord.com/oauth2/authorize?client_id=THE_ID&scope=bot%20applications.commands&permissions=3088
   ```

   Confirms: you get the normal authorization screen with a server dropdown.
   That means the bot is Public and you can put it back. Save the URL.

   **If the page errors instead**, most likely saying the application cannot be
   added by you, the bot is not Public. **Say it plainly before continuing: the
   cutover is one-way and rollback does not exist.** Your only recovery would be
   asking her to re-invite it, which the whole point of this move is to avoid
   depending on. Decide whether you are willing to proceed on that basis, and
   consider asking her for the invite link first.

   > 3088 is View Channel plus Send Messages plus Manage Channels. It only
   > matters if you actually authorize, which you are not doing here.

4. **Tell the admin team before you swap.** Members will watch one bot leave and
   a differently named bot join, and this server has just spent a weekend
   watching the bot look broken. A sentence in advance costs nothing and stops
   the change reading as another failure.

5. **Remove the old bot from the server.** Server settings, Members, find the
   bot, Kick. Under Branch A, skip this and instead reset the token in the
   portal, then `fly secrets set DISCORD_TOKEN=...`.
   Confirms: the bot is gone from the member list, and typing `/theme-bot` no
   longer offers its commands.

6. **Invite your new bot** using the URL from
   [section 4.6](#46-build-the-invite-link). Select the real server. Authorize.
   Confirms: your bot appears in the member list and shows as online.

7. **Check channel-level permissions.** Server-wide permissions are not the
   whole story: a channel can have overwrites that deny access regardless. Open
   the target channel's settings, Permissions, and confirm your bot's role is
   not denied **View Channel**, **Send Messages**, or **Manage Channels**.
   Confirms: `fly logs` after a restart shows
   `Permissions validated for channel: <name>` with no warning.

   > Role position in the server's role list governs managing _roles and
   > members_, not editing channels. For renaming, the Manage Channels
   > permission plus channel-level access is what matters. You do not need to
   > drag the bot's role up the list.

8. **Register the slash commands.** From your machine, with the **real**
   application's credentials in `.env`:

   ```bash
   pnpm build
   pnpm register
   ```

   See [Appendix B](#appendix-b-what-pnpm-register-does) for exactly what this
   does. Confirms: typing `/theme-bot` in the server offers the subcommands.

   > Global commands can take up to an hour to appear. If they are missing after
   > five minutes, wait before assuming failure.

9. **Verify from inside Discord.** Run `/theme-bot themes`.
   Confirms: the upcoming list matches the table in section 3.2, the `(current)`
   marker sits on the theme matching the channel's actual name, the count reads
   14, and the footer shows a `build` marker.

10. **Do not run `/theme-bot rotate-now` to test.** It renames the channel for
    real and spends rate limit budget. You already tested rotation on your own
    server in [section 6.6](#66-testing-rotations-and-the-rate-limit). Wait for
    Monday and watch the logs.

11. **Watch the first real rotation.** On Monday, `fly logs`. Compare against
    [Appendix A](#appendix-a-reading-the-logs).

12. **Merge, deploy, then confirm.** Run `/theme-bot themes` and check the
    build value in the footer against the commit you merged. It reads as the
    commit date and the short git SHA the image was built from, so it changes
    by itself. That is the loop that had never closed on this project.

---

## 9. Rollback

**If the new host does not come up, or the bot misbehaves after cutover:**

**Branch B. Rollback is conditional, and you must check the condition before
cutting over, not after.**

Re-inviting her bot needs two things:

- **Her application's client ID.** Obtainable without her: right-click the bot
  in the member list and Copy User ID, which for a bot is the application ID.
- **Her bot marked Public** in her application settings. Not obtainable without
  her, and not visible to you directly. If Public Bot is off, only the
  application owner can add it to a server.

Neither is verified. **Step 3 of [section 8.2](#82-the-ordered-steps) is the
test**, and it runs before anything is removed: build the invite URL from the
copied ID and load it without authorizing.

**If the authorization screen appears**, rollback is real and cheap. Save that
URL. If the new host does not come up, re-invite her bot with it. Her instance
is still running and resumes the moment the bot regains channel access. You are
back to the old broken-but-known state, having lost only time.

**If the page errors**, the bot is not Public and **rollback does not exist**.
Removing her bot is then a one-way door, and your only recovery is asking her to
re-invite it, which is exactly the dependency this move exists to remove. That
is not a reason to abandon the move. It is a reason to know it before you kick
anything, and to have the new host fully working and verified first. Consider
asking her for the invite link, or to make the bot Public, before you start.

**Branch A.** Rollback is much weaker, because resetting the token permanently
killed her instance. Your only path is forward: fix your host. This asymmetry is
the reason Branch A resets the token last, only after everything else is proven
working.

**If a deploy breaks the bot rather than the cutover:**

```bash
fly releases                    # list previous versions
fly deploy --image <previous>   # or redeploy an earlier commit
```

The volume is untouched by a rollback, so your theme list and rotation position
survive.

**If you suspect the data is wrong**, read it before changing anything:

```bash
fly ssh console -C "cat /data/themes.json"
fly ssh console -C "cat /data/state.json"
```

---

## 10. What You Now Own

She handled all of this invisibly. Now you do. None of it is hard; all of it
fails silently if ignored, which is exactly how this project got here.

**Restarts.** Fly restarts a machine that crashes. It cannot fix a crash loop,
where the bot starts, fails, and exits repeatedly. Symptom: the bot is offline in
Discord. Check with `fly status` and `fly logs`. The most likely cause is a
malformed file on the volume.

**Deploys.** Nothing is automatic, deliberately. Dependabot will keep opening
dependency PRs. Merging one changes `main` and changes nothing in production
until it is deployed. **If you ignore this, you will eventually believe a fix
is live when it is not, which is the exact failure that started all of this.**
The footer of `/theme-bot themes` shows the commit date and the short git SHA
the running image was built from, so comparing it with
`git rev-parse --short=7 origin/main` answers "is my change live" without
trusting anyone's memory. `unknown` there means the values never reached the
image.

Deploy by hand with `pnpm deploy` rather than `flyctl deploy` directly. It
passes the marker for you, and refuses to claim a commit when the working tree
is dirty.

**The machine going down.** A Fly volume lives on one physical host, so a host
failure can mean downtime until it is restored. Fly takes automatic volume
snapshots, but retention is short and the details have changed over time.
**Verify the current snapshot policy yourself** with `fly volumes snapshots list`
rather than trusting this paragraph.

**Backups.** `themes.json` on that volume is the only copy again, which is the
situation you just escaped. Copy it somewhere else on a schedule:

```bash
fly ssh console -C "cat /data/themes.json" > ~/backups/themes-$(date +%F).json
```

`/theme-bot reload-config` attaches `themes.json`, `state.json` and
`config.json` to its reply,
so you can also pull a backup from inside Discord with no terminal at all.

**Billing.** A card expiring means Fly suspends the app. The bot stops, the
rotation stops, and **nothing anywhere reports an error**, because there is no
process left to log one. This is the same silent-failure class as the dead
deploy. Put a calendar reminder to check `fly status` monthly, and keep the
billing email address one you actually read.

**Certificates.** Not applicable. The bot serves no web traffic and has no
domain, so there is nothing to expire.

**The token.** If it leaks, reset it in the developer portal and immediately
`fly secrets set DISCORD_TOKEN=...`. A leaked token lets anyone rename channels
as your bot.

**Rotation failures are logged but not announced.** If a rename fails, the log
says so and Discord does not. You now own the logs, so this is visible rather
than invisible, but it still requires you to look. Checking `fly logs` after the
first few Mondays is worth the habit. Posting failures to a private admin
channel would remove the need to look at all, and is a good follow-up once the
move is done.

---

## Appendix A: Reading The Logs

`fly logs` streams live. `fly logs` alone shows recent history, though retention
is short, so check within a day or two of a rotation rather than a week later.

> The theme names and index numbers in these examples are illustrative. They
> are not a statement about where the rotation currently is. Nothing in this
> document is.

### Healthy Startup

```
Logged in as your-bot-name#1234
Permissions validated for channel: weekly-theme-example
Current theme index: 4
Next theme: Weekly theme example
Bot is ready!
```

> `Next theme:` is mislabelled in the code. It prints the _current_ theme, the
> one matching the channel name, not the one coming next. Harmless, but do not
> read it as a prediction.

### A Successful Rotation

```
[2026-09-07T15:00:00.123Z] Starting rotation
Channel renamed to: weekly-theme-example
Theme announcement message sent
State saved. Current theme index: 5
[2026-09-07T15:00:01.456Z] Rotation complete
```

All five lines. `Channel renamed to:` and `State saved.` together are the proof.

### A Failed Rename

```
[2026-09-07T15:00:00.123Z] Starting rotation
ERROR renaming channel #123456789: Missing Permissions code=50013 status=403 PATCH /channels/123456789
Scheduled rotation failed: Missing Permissions code=50013 status=403 PATCH /channels/123456789
[2026-09-07T15:00:00.456Z] Rotation complete
```

Note that `Rotation complete` prints on failure too. It means the attempt
finished, not that it worked. The `ERROR` line is the signal. Common codes:

- `50013 Missing Permissions`: the bot lost Manage Channels, or a channel
  overwrite is denying it.
- `50001 Missing Access`: the bot cannot see the channel. Under Branch B this is
  what her orphaned instance will now be logging forever.
- `10003 Unknown Channel`: `channelId` in `config.json` is wrong, or the channel
  was deleted.
- `429`: rate limited. Two renames per ten minutes.

**Important: the state does not advance when the rename fails.** The index only
saves after a successful rename, so a failed week retries the same theme rather
than skipping it.

### A Rename That Worked But No Announcement

```
Channel renamed to: weekly-theme-example
ERROR sending announcement: Missing Permissions code=50013 status=403
State saved. Current theme index: 5
```

The rotation still counts as successful. Announcement failures are caught
separately so a missing Send Messages permission cannot block the rename.

### A Rotation That Did Nothing

```
Channel already named "weekly-theme-example", skipping rename
```

The channel already had the target name, so the API call was skipped and the
index still advanced. Normal after a manual rename.

### Nothing At All At The Scheduled Time

No log lines at 8:00 AM Monday means the process was not running, or the cron
did not fire. Check `fly status` first. If the machine is up and the logs show
`Bot is ready!` but no rotation, check `schedule` and `timezone` in
`config.json`, and remember the container runs in UTC while the cron respects
the `timezone` field.

---

## Appendix B: What pnpm register Does

You will run this yourself for the first time, so it is worth knowing exactly
what it does before you do.

```bash
pnpm build && pnpm register
```

It reads `DISCORD_TOKEN` and `CLIENT_ID` from the environment, builds the
command definitions in `register-commands.ts`, and sends them to Discord.

`.env` is a fallback, not the only source. `dotenv` does not overwrite a
variable that is already set, and it falls back one variable at a time, so an
inline value wins while anything you leave out still comes from `.env`. That
matters because `.env` holds the throwaway test application's credentials and
should stay that way: pointing it at production is what caused the
2026-09-01 incident where a local process and the Fly machine both answered the
same interaction.

To register against production without touching `.env`, and without the token
appearing in shell history, read it from a file:

```bash
pnpm build
DISCORD_TOKEN="$(cat ~/.config/theme-bot/token)" CLIENT_ID=<production client id> pnpm register
```

Only the `cat` is recorded in history. Global commands can take up to an hour to
propagate, so a command that has not changed shape yet is expected rather than a
failure.

**It is a full replace, not a merge.** The call is an HTTP `PUT` to the
application's global commands. Discord replaces the entire command list with
whatever you send. **Any command not in that array is deleted.** There is no
partial update and no way to add one command without sending them all.

Practical consequences:

- Running it with the current `register-commands.ts` gives you exactly the nine
  subcommands under `theme-bot` and nothing else.
- Commands are registered **per application**, not per server. Her application
  keeps its own commands until her application is deleted, which you cannot do.
  Removing her bot from the server is what makes them disappear for members.
- The bot does not need to be running. This is a plain HTTP call.
- Global commands can take up to an hour to propagate. They usually appear much
  faster, but do not treat five minutes of absence as failure.
- You only need to re-run it when the command definitions change. Deploying new
  handler code does not require it.

**Under Branch B this is the thing that stops being frozen.** For the entire
history of this project, adding a subcommand or an option was impossible because
only she could register it. Once you own the application, that constraint is
gone.
