# Database Setup for Pelican to Murder

This build supports persistent sessions.

## Local testing

If `DATABASE_URL` is not set, the app stores session data in:

```text
./data/sessions.json
```

Run locally:

```bash
npm install
npm start
```

## Render production setup

Use Render Postgres for production.

1. In Render, create a new PostgreSQL database.
2. Copy the database Internal Database URL.
3. Open your Pelican to Murder Web Service.
4. Go to Environment.
5. Add:

```text
DATABASE_URL=your_internal_database_url
NODE_VERSION=20.18.1
```

The repo also includes `.node-version`, so Render should use Node 20.18.1 automatically.

## Render build settings

Use:

```text
Build Command: npm install
Start Command: npm start
```

## Important

Do not commit `node_modules`.
Do not commit a `package-lock.json` created in a private/internal environment.
If a deploy fails during `npm install`, clear Render's build cache and redeploy.
