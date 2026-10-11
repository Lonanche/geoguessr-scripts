# GeoGuessr Scripts

A collection of GeoGuessr userscripts by **trausi** ([lonanche](https://github.com/lonanche)). More scripts will be added here over time.

## Available scripts

| Script | Description | Install |
| --- | --- | --- |
| [History Result Links](./geoguessr-game-results.user.js) | Adds an info icon beside the expand arrow in your map game history. Click it to open that game's result in a new tab. | [Install](https://raw.githubusercontent.com/lonanche/geoguessr-scripts/main/geoguessr-game-results.user.js) |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Click **Install** for the script you want, then confirm installation in Tampermonkey.
3. Reload GeoGuessr.

## History Result Links

Open a map on GeoGuessr and view your game history. An info icon appears to the left of each matched game's expand arrow. The arrow still expands the round details, and the icon opens the full result in a new tab.

The script reads GeoGuessr's own game-history responses and matches games by timestamp and score. It makes no additional game API requests. If no matching response is available, it adds no icon.

It runs across GeoGuessr so it can observe requests when you navigate to a map without a full page reload. Row scanning only happens on map pages after game data is received. There is no polling.

## Updates

GitHub installations use this repository's `main` branch for automatic updates through Tampermonkey. New releases must increase the script's `@version`.

## Feedback

Report bugs or suggest scripts through [GitHub Issues](https://github.com/lonanche/geoguessr-scripts/issues). For bugs, include your browser, userscript manager, and steps to reproduce the problem.

This project is not affiliated with GeoGuessr.
