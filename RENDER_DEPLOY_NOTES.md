# Fear Garden — Render Ready Build

This zip is flattened for Render. `package.json` is at the root level, so you do NOT need to set a Root Directory.

Render settings:

Build Command:
```bash
npm install
```

Start Command:
```bash
npm start
```

Recommended environment variables:
```text
NODE_VERSION=20.18.1
DATABASE_URL=<your Render Postgres Internal Database URL>
```

If `DATABASE_URL` is not set, the app uses `./data/sessions.json` as a local fallback.
