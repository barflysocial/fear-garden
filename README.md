# Fear Garden

Mobile-friendly live hosted detective mystery game for venues.

## Run locally

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000/host/
http://localhost:3000/player/
```

## Database

- If `DATABASE_URL` exists, the app uses PostgreSQL.
- If `DATABASE_URL` does not exist, the app uses `./data/sessions.json`.

## Render settings

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
NODE_VERSION: 20.18.1
```

See `DATABASE_SETUP.md`.


## Exact Pelican Mimic Build
This build uses the Pelican to Murder pages, layout, flows, and feature behavior as the template. The intentional differences are the Fear Garden title/branding artwork and the Fear Garden truth packs.
