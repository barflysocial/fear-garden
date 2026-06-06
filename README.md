# Barfly Social Escape Experiences

Production multiplayer choice-game engine for Render and GitHub.

## Included

- Six selectable host-controlled episodes
- Separate `/host` and `/play` experiences
- 4-digit host PIN access with temporary lockout after repeated failures
- Server-authoritative automatic phase timers
- Multiple sessions can advance simultaneously
- Host pause, resume, add-time, auto-run toggle, manual advance, remove-player, and reset controls
- PostgreSQL persistence through `DATABASE_URL`
- Local JSON persistence for local development
- QR join links
- Player title splash with Tap to Start
- Public discussion, private alliances, private cards, choices, results, final encounter, and awards
- Draft preservation during live polling

## Local start

```bash
npm install
npm start
```

Open:

- Host: `http://localhost:3000/host`
- Player: `http://localhost:3000/play`

## Render deployment

Upload the contents of this folder to the root of a GitHub repository. Connect the repository to Render using the included `render.yaml`. Render provisions the web service and PostgreSQL database.

## Automated timing

The server controls every phase. Closing the host screen does not stop a running game.

Standard timing:

- Role Reveal: 20 seconds
- Public Event: 30 seconds
- Private Scenario: 45 seconds
- Public Discussion: 90 seconds
- Private Alliance: 90 seconds
- Choice Lock: 60 seconds
- Round Results: 45 seconds
- Final Intro: 45 seconds
- Final Choice: 60 seconds

Quick and Long modes use shorter or longer timing. `PHASE_TIME_SCALE` is available only for automated testing; leave it unset in production.

## Host PIN

A 4-digit PIN is required when the game is created. The PIN is hashed with `scrypt`; it is never returned by the API or stored as plain text. Five failed attempts temporarily lock host access for five minutes.

## Persistence

When `DATABASE_URL` is configured, game sessions are stored in PostgreSQL. Without it, local development uses `.data/sessions.json`.


## Delete Session

Hosts can permanently delete a session from the saved-game list or the open game controls. The action requires the 4-digit host PIN or an already unlocked host session, plus typing `DELETE` as confirmation. Deletion removes the session from PostgreSQL or local file storage.

## Version 3.1.0 updates

- Full-screen mobile `/play` splash with Tap to Start
- Server-synchronized episode story introduction before role reveal
- Correct player choice lock refresh using `currentChoice`
- High-contrast choice-card text and locked-state styling
- Alliance management during the Private Alliance phase: rename, change members, leave, or disband

## Story-Driven Round System

Every round now includes:

- A multi-paragraph Public Event that explains the immediate crisis, limited resources, and consequences.
- Immediate Danger and Resources in Play panels.
- A guided Public Discussion mission with three questions the group must answer.
- Public pledges that everyone can see before final actions are locked.
- A guided Private Alliance phase with suggested negotiations, trades, warnings, and betrayal plans.
- Five specific action choices per round instead of three generic choices.
- Trust consequences when a player keeps or breaks a public pledge.
- Story-driven round results that carry consequences into the next crisis.

The automated server timer continues to control every phase, including discussion, alliances, choice locking, results, and the final encounter.
