# Barfly Choice Engine

A full working web-app prototype for a multiplayer, Oregon Trail-style choice engine with selectable story episodes.

The host chooses one episode before the game starts. The same engine then runs public events, private scenario cards, public discussion, private alliance messaging, choice locking, round resolution, a final encounter, endings, and awards.

## Included episodes

1. **Island Survivor** — survive the island and face The Watcher.
2. **Zombie Safehouse** — survive a zombie breach and possible hidden infection.
3. **Murder Mansion** — solve the murder before the killer strikes again.
4. **Space Colony** — survive a failing colony and the AI judgment.
5. **The Bunker** — override the bunker protocol before it chooses who lives.
6. **Bank Heist Gone Wrong** — escape the police breach and expose the informant.

## Features

- Episode selector on the host create screen
- Scheduled games with event date and start time
- Join QR code and share link on both host and player screens
- Fully separated `/host` and `/play` experiences; player screens do not show host controls
- Host dashboard
- Player join flow with game code
- Up to 6 players
- Episode-specific roles
- 6-round choice engine per episode
- Episode-specific public events, private cards, stats, group meters, final threats, final choices, endings, and award labels
- Public chat
- Private player-to-player messages
- Secret alliance groups and group messages
- Player stats and group stats
- Hidden pressure/threat meter for the host/engine
- Choice resolution engine
- Final encounter and ending calculation
- Player awards
- PostgreSQL persistence through `DATABASE_URL`
- Local file fallback persistence at `.data/sessions.json`

## Database persistence

The app supports a real PostgreSQL database.

When `DATABASE_URL` is set, the server automatically:

1. connects to PostgreSQL,
2. creates the table `island_survivor_sessions` if it does not exist,
3. loads saved game sessions on startup,
4. saves sessions after every game-state change.

The table stores each game session as a JSONB state document:

```sql
CREATE TABLE IF NOT EXISTS island_survivor_sessions (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This keeps the engine flexible because new episodes can be added without changing database columns.

If `DATABASE_URL` is not set, the app uses a local file store at `.data/sessions.json` so development still works without installing PostgreSQL.

## Run locally

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Run locally with PostgreSQL

Set a PostgreSQL connection string before starting:

```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
npm start
```

On Windows PowerShell:

```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
npm start
```

## Deploy to Render with PostgreSQL

This project includes a `render.yaml` blueprint that creates:

- a Node web service
- a PostgreSQL database
- a `DATABASE_URL` environment variable connected to the app

Steps:

1. Push this folder to GitHub.
2. In Render, create a new Blueprint from this repo.
3. Render will run `npm install`, start with `npm start`, and pass the database connection string to the app.

You can also create the database manually and add its connection string as the `DATABASE_URL` environment variable on the web service.

## Health check

Visit this endpoint after deployment:

```text
/api/health
```

It returns whether the app is running, how many episodes are available, and whether it is using PostgreSQL or local file persistence.

## Game flow

Host flow:

```text
Choose Episode → Schedule Date/Time → Create Game → Share QR/Join Link → Players Join → Start Game → Advance Phases → Resolve Rounds → Final Encounter → Ending
```

Player flow:

```text
Join Game → Lobby → Role Reveal → Private Scenario → Chat/Alliance → Lock Choice → Results → Final Choice → Awards
```

## How to play

### Player instructions

1. Open the player screen at `/play`.
2. Enter the game code from the host and choose an alias.
3. Tap the episode title card to begin and wait in the lobby.
4. When the host starts the game, read your assigned role.
5. Each round, read the public event and your private scenario card.
6. Use public chat to talk with everyone.
7. During the private alliance phase, message one player or an alliance group to make deals, share secrets, lie, or betray.
8. Lock one action each round: Help the Group, Help Yourself, or Take a Risk.
9. Watch your personal stats and the visible group meters.
10. After six rounds, lock a final encounter choice and see the ending/awards.

### Host instructions

1. Open the host screen at `/host`.
2. Choose the episode, venue/session name, max players, and mode.
3. Set the event date and start time, then click Create Episode.
4. Share the QR code, copied join link, or game code with players. Players should join from `/play`, not `/host`.
5. Once players join, click Assign Roles + Start Game.
6. Advance the game through each phase: Public Event, Private Scenario, Public Discussion, Private Alliance, Choice Lock, and Results.
7. Monitor the dashboard for player stats, group stats, choices, public chat, private alliance messages, hidden threat pressure, and host-only truth summaries.
8. At Choice Lock, wait for players to choose or advance when ready.
9. Click Resolve Round to let the engine calculate stat changes, clues, betrayals, threat pressure, and injuries.
10. Reveal the round results to players.
11. After Round 6, start the final encounter, let players lock final choices, then resolve and reveal the ending.
12. Use Reset Session only when the game is finished or you want to clear that session.

### Host/player screen separation

- `/host` is for the game runner only.
- `/play` is for players only. It contains no host dashboard controls, no create-game controls, and no link back to `/host`.
- `/` is a simple portal that links to both screens.

## Adding new episodes

New episodes live in `episodes.js`. Add a new episode object with:

- title, tagline, and final threat
- role names/descriptions
- stat labels and group stat labels
- 6 rounds with three choices each
- final choice labels
- ending names and ending text

The existing database can store the new episode automatically.


### QR join feature

Every session generates a player join URL in this format:

```text
/play?code=GAMECODE
```

The host dashboard and player screen both display a QR code, Copy Join Link button, and Share button so nearby players can join by scanning or receiving the link.

### Scheduling

The host create screen includes Event Date and Event Start Time. These values are saved with the session and displayed in the host dashboard, player lobby, and player game header.


## Current Build Notes

- `/play` share/QR is only on the join screen when a game code is present. It is removed from the active player game dashboard.
- Player active screen uses buttons for Status, Group Status, and Players. Each opens a modal instead of showing long scrolling stat panels.
- Sessions auto-run through Role Reveal, Public Event, Private Scenario, Public Discussion, Private Alliance, Choice Lock, Results, and Final Encounter timers.
- Host can still manually advance phases and toggle Auto-Run on/off from the host control screen.
