# Fear Garden

A mobile-friendly live hosted murder mystery game for Beer Garden in Baton Rouge, Louisiana, built from the Pelican to Murder final build structure.

## What is included
- Player app at `/player/`
- Host dashboard at `/host/`
- RSVP flow before paid access code entry
- First name, last name, and optional Instagram fields
- 25-player default cap per table/session
- Paid personal access codes using the `FG-` prefix
- 5 selectable levels: Training, Rookie, Junior, Detective, Senior
- Unique culprit, method, motive, evidence, and answer choices for every level
- Unified detective app dashboard: Phone, Messages, Maps, Bank, Photos, Social, Contacts, Notes, Files, Browser, Accuse
- Host popups, opening narration, round narration, reveal, results, and testing controls

## Run locally
```bash
npm install
npm start
```

Open:
- Host: `http://localhost:3000/host/`
- Player: `http://localhost:3000/player/`

## Deploy
Use the same Render setup as the Pelican to Murder build. Keep `server.js`, `package.json`, `public/`, `truth-packs/`, and `data/` together.
