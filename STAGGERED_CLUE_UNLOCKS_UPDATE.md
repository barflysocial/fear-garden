# Staggered Clue Unlocks Update

This build spaces out Fear Garden evidence unlocks so players are not hit with multiple clue notifications at the same time.

## Changes

- Every clue/evidence item now unlocks one at a time.
- Minimum gap between clue unlocks is 60 seconds.
- No two clue notification popups should fire at the same exact unlock time.
- Standard Fear Garden levels now begin clue unlocks at 00:45 and continue through 26:45.
- Demo mode uses the same staggered one-at-a-time behavior.
- Clue notification popups remain OK-only.
- Clue popups still do not reveal clue titles or clue text.
- Players still open the correct investigation app/icon to read the clue.

## Timing Rule

The investigation begins after the 5-minute case briefing. Once the 30-minute investigation starts, clues unlock one at a time using this pattern:

- First clue: 00:45
- Each additional clue: every 60 seconds after that
- Final standard level clue: 26:45

This leaves time near the end for review, final accusation, and case reveal.
