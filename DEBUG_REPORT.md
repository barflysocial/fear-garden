# Debug Report — Version 3.3.1

## Passed
- Flattened Render/GitHub project structure
- Dependency install and syntax checks
- `/`, `/host`, `/play`, health, episodes, QR, join, host PIN, reset, delete routes
- Browser runtime smoke tests for portal, host, player, private scenario, public pledge, alliance, and choice lock
- Automated server progression through all six rounds and final ending for all six episodes simultaneously
- Session persistence and player-state privacy checks

## Fixes in this debug build
- Prevented duplicate host dashboard refresh intervals after dashboard rerenders
- Added production security headers and a restrictive content security policy
- Added targeted rate limits for session creation, joining, and host PIN attempts
- Added clear 413 handling for oversized JSON requests
- Missing static assets now return 404 instead of returning the app HTML
- Added validation requiring both date and time together, and a schedule for auto-start
- Prevented players from sending direct private messages to themselves
- Added no-store caching for HTML, JavaScript, and CSS to reduce stale-deployment problems
