Demo clue popup fix:
- Demo access-code joins now create a fresh private demo session each time instead of reusing the persistent DEMO session.
- Fresh demo session codes look like DEMO-XXXXX, which prevents old local clue acknowledgments from suppressing notifications.
- The briefing-to-investigation transition now triggers notification-only popups for clues that are already visible at unlockSec 0.
- Popups still do not reveal clue titles or clue text; players must open the designated app/icon to read evidence.
