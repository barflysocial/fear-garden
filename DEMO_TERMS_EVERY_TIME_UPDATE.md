# Demo Terms Every Time Update

- Demo access-code entry now forces the Terms & Conditions modal every time.
- Demo terms acceptance is not stored as a permanent browser acceptance.
- Normal RSVP and non-demo access-code flows still use the existing browser acceptance behavior.
- Server preview state now marks demo sessions with `demoMode: true` so the player screen can identify demo access codes even when the host changes the demo code.
