# Fear Garden RSVP Session Browser Update

This build changes RSVP from a single event form into a movie-theater style session browser.

## Player RSVP flow
- Title screen still shows the clean Fear Garden layout.
- RSVP opens a searchable session browser.
- Players can filter by:
  - Date
  - Time
  - Mystery
  - Skill level
- Players tap an available showtime, then enter:
  - First name
  - Last name
  - Phone or email
  - Optional Instagram
  - Optional team name
- Each RSVP reserves one detective spot for the selected session.
- Players still need a paid personal access code to enter the live game.

## Host session creation
The host create-session panel now includes:
- Event date
- Event time
- RSVP status: Open, Private, or Sold Out

Private sessions are hidden from the public RSVP browser.
Sold-out sessions appear as unavailable.

## Render settings
Root Directory: leave blank
Build Command: npm cache clean --force && npm install --no-audit --no-fund
Start Command: npm start
