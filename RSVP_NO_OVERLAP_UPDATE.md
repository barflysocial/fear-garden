# RSVP No-Overlap Update

This build adds overlap protection to the RSVP system.

## What changed

- Host can set a session duration in minutes.
- Default session duration is 45 minutes.
- Each RSVP session now has a time window: event start time + duration.
- The same player cannot RSVP for another session if the time windows overlap.
- The overlap check uses contact information first, and also checks first name + last name as a backup.
- Players can still update their existing RSVP for the same session.
- The player showtime cards now display session duration.

## Example

If a player RSVPs for 7:00 PM with a 45-minute duration, they cannot reserve another session starting at 7:30 PM. They can reserve 8:00 PM or later if the windows do not overlap.
