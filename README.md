# 2026 SMCS Senior Symposium

Schedule and project guide for the SMCS Senior Symposium: 58 senior research presentations on Tuesday, December 15 and Thursday, December 17, 2026.

## Features

- Day 1 / Day 2 schedule that opens on the current day automatically
- Search by name, title, keyword, or internship site
- Filters for period, room, topic, technology, and application
- Star talks to build a personal schedule (saved in your browser)
- All projects view with related presentations for each talk

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styles (light and dark mode) |
| `script.js` | Schedule, search, filters, and starred talks |
| `data.js` | Presentation data, rooms, and dates |
| `fonts/` | Newsreader and Source Sans 3 (SIL Open Font License) |

## Running locally

No build step. Open `index.html` in a browser.

## Deploying

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`.

To update the schedule, edit `data.js`.
