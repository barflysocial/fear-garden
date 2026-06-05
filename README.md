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
Choose Episode → Create Game → Players Join → Start Game → Advance Phases → Resolve Rounds → Final Encounter → Ending
```

Player flow:

```text
Join Game → Lobby → Role Reveal → Private Scenario → Chat/Alliance → Lock Choice → Results → Final Choice → Awards
```

## Adding new episodes

New episodes live in `episodes.js`. Add a new episode object with:

- title, tagline, and final threat
- role names/descriptions
- stat labels and group stat labels
- 6 rounds with three choices each
- final choice labels
- ending names and ending text

The existing database can store the new episode automatically.
