# Barfly Choice Engine — Production Build

A production-ready multiplayer web game engine for Barfly Social choice-based story games.

This build includes separated Host and Player screens, scheduled games, QR-code joining, selectable episodes, PostgreSQL persistence, local development fallback storage, server-owned QR generation, hardened HTTP headers, rate limiting, and Render/GitHub deployment files.

## Routes

```text
/       Portal
/host   Host control only
/play   Player join/gameplay only
```

Players should join only from `/play` or from a QR/link in this format:

```text
/play?code=GAMECODE
```

## Included episodes

1. **Island Survivor** — survive the island and face The Watcher.
2. **Zombie Safehouse** — survive a zombie breach and possible hidden infection.
3. **Murder Mansion** — solve the murder before the killer strikes again.
4. **Space Colony** — survive a failing colony and the AI judgment.
5. **The Bunker** — override the bunker protocol before it chooses who lives.
6. **Bank Heist Gone Wrong** — escape the police breach and expose the informant.

## Production features

- Separate `/host` and `/play` screens
- No host control controls on `/play`
- Scheduled game date and time
- QR-code join feature on Host and Player screens
- Server-generated QR SVG endpoint, not a third-party QR image service
- Copy/share join link buttons
- Host recovery key with resume-by-key form
- Episode-specific 9:16 title-card assets
- Tap-to-Begin intro screen per episode
- Host control and player gameplay UI
- Up to 6 players per game
- 6-round choice engine per episode
- Public events, private scenarios, public chat, private alliance messaging, action lock, resolution, final encounter, endings, and awards
- PostgreSQL persistence through `DATABASE_URL`
- Local file persistence fallback at `.data/sessions.json`
- Security headers and same-origin content security policy
- API rate limiting
- Request body size limit
- Input cleanup for names, aliases, chat, and alliance names
- Health check endpoint at `/api/health`
- Render blueprint included

## Install locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Run syntax checks:

```bash
npm run check
```

## Local PostgreSQL

```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
npm start
```

Windows PowerShell:

```powershell
$env:DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
npm start
```

## Render deployment

This project includes `render.yaml`.

Recommended deployment:

1. Unzip this build.
2. Put the contents of the `island-survivor/` folder at the root of the GitHub repository.
3. Push to GitHub.
4. In Render, create a new Blueprint from the repository.
5. Render will run `npm install` and `npm start`.
6. Render will provide `DATABASE_URL` from the managed PostgreSQL database.

After deployment, check:

```text
/api/health
```

## Important production note

The included `render.yaml` is configured to deploy immediately. For paid live commercial use, choose the Render service and database plans you want in your Render control screen. The code supports PostgreSQL, but production uptime, backups, custom domain, and scaling are controlled by your hosting plan.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Server port | `3000` locally / Render-provided in production |
| `DATABASE_URL` | PostgreSQL connection string | local file storage if unset |
| `NODE_ENV` | Runtime mode | `development` |
| `MAX_BODY_BYTES` | Max JSON request body size | `1048576` |
| `RATE_LIMIT_WINDOW_MS` | API/static rate-limit window | `60000` |
| `RATE_LIMIT_MAX` | Requests allowed per IP per window | `240` |
| `APP_ORIGIN` | Optional additional allowed connect origin | empty |

## Host flow

```text
Open /host
Choose episode
Set venue/session name
Set scheduled date/time
Set max players and mode
Create episode
Save the Host Recovery Key privately
Share the QR code or join link
Wait for players
Assign Roles + Start Game
Advance each phase
Resolve rounds
Start final encounter
Reveal ending and awards
```

## Player flow

```text
Open /play or scan QR code
Enter game code and alias
Tap the episode title card to begin
Wait in lobby
Receive role
Read public event and private scenario
Chat publicly
Message privately during alliance phase
Lock action choice
View results
Make final choice
View ending and awards
```

## Host/player separation

- `/host` contains create game, schedule game, QR/share, player management, phase control, hidden stats, private-message monitor, round resolution, reset, and host recovery tools.
- `/play` contains only player join, player lobby, role reveal, private scenario, public chat, private alliance messaging, action choice, results, final choice, share QR, ending, and awards.
- `/play` does not show create-game controls, host control controls, reset controls, remove-player controls, phase controls, host hidden stats, or links back to `/host`.

## QR system

QR codes are generated by the app server at:

```text
/api/sessions/GAMECODE/qr.svg
```

The QR encodes:

```text
/play?code=GAMECODE
```

## Database schema

The app creates this table automatically when `DATABASE_URL` is set:

```sql
CREATE TABLE IF NOT EXISTS island_survivor_sessions (
  code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The JSONB session state keeps the engine flexible so new episodes can be added without database migrations.

## Adding new episodes

Add new episode objects in `episodes.js` with:

- ID, title, subtitle, tagline
- title-card asset in `public/titlecards/`
- roles
- stat labels and group stat labels
- six rounds
- private cards
- final choices
- ending names/text

## Files

```text
package.json
server.js
db.js
episodes.js
database.sql
render.yaml
public/index.html
public/app.js
public/styles.css
public/titlecards/*.png
```
