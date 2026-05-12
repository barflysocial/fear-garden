# Fullscreen title screen force update

This update removes the centered `fear-garden-logo-only.png` title image from the title screen and uses `fear-garden-title-bg.png` as a full-bleed mobile background.

It also cache-busts the CSS and background image URL so Render/browser caching is less likely to keep showing the old centered layout.
