# Fear Garden — Final Master Build

A mobile-friendly live detective mystery game for Mid City Beer Garden in Baton Rouge, Louisiana.

## Start locally

```bash
npm install
npm start
```

Open:

- Player/title screen: http://localhost:3000/
- Host dashboard: http://localhost:3000/host/
- Check-in flow: generated from each host session QR

## Render setup

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Optional environment variable for Postgres:

```bash
DATABASE_URL=<your Render Postgres internal database URL>
```

If `DATABASE_URL` is not set, the app uses the local JSON session file in `data/sessions.json`.

## What this clean master build includes

- Logo splash screen before title screen
- Mobile-optimized Fear Garden title screen
- RSVP calendar/date flow
- Free event shared access codes
- Paid event unique access codes
- Capacity and overlapping-session protection
- Venue check-in QR flow
- Share button with QR modal and rich-link metadata
- Demo mode with editable demo access code in host dashboard
- Demo reset and delete buttons
- Demo Terms & Conditions shown every time
- Terms & Conditions acknowledgment for regular flow
- 5-minute pre-game case briefing
- Orange-to-pink gradient briefing countdown bar
- Level-specific case briefings/truth packs
- 30-minute investigation timer
- Staggered clues: one clue at a time, spaced apart
- OK-only clue notification popups
- Clue popups do not reveal clue title or clue text
- Players must open investigation icons to read evidence
- Automated case reveal when the timer ends
- Clean Case Revealed ending screen
- Optional Review My Answers button
- Optional Review Full Case Logic button
- Find a New Game button after completion

## File structure

```text
fear-garden-master-clean/
├── package.json
├── server.js
├── database.js
├── render.yaml
├── README.md
├── data/
│   └── sessions.json
├── public/
│   ├── assets/
│   ├── checkin/
│   ├── host/
│   ├── player/
│   └── shared/
└── truth-packs/
```

This package intentionally removes old update notes, backup files, and duplicate build artifacts so it can be uploaded cleanly to GitHub or Render.
