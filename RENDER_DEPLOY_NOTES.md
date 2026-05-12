# Fear Garden Render Deploy Notes

This rebuild is flattened for Render and removes the old package-lock file so Render can install dependencies fresh from npm.

## Render settings

Root Directory: leave blank

Build Command:
```bash
npm cache clean --force && npm install --no-audit --no-fund
```

Start Command:
```bash
npm start
```

Environment Variables:
```text
NODE_VERSION=20.18.1
DATABASE_URL=<your Render Postgres Internal Database URL>
```

If Render still uses an old broken dependency cache, click **Manual Deploy → Clear build cache & deploy**.
