# Roses 🌹

A little app for her phone. Every day she gets a new **3D bouquet** of pink, white and red roses, plus a note from you.

- She taps a sealed envelope and the roses bloom open one by one.
- **Drag** to spin the bouquet all the way around, **pinch** to zoom in.
- **Tap a flower to pick it up.** It floats out of the bouquet toward her, slowly turning, and a little message from you pops up. Tap again (or anywhere else) to put it back.
- **💧 Water:** rain falls on the bouquet, then every flower perks up, sparkles and drops a few petals.
- **💗 Love:** hearts float up out of the whole bouquet.
- A counter shows which bouquet number it is.
- Every day is different: 11 color mixes, 19–25 roses, 5 wrapping papers, 4 ribbons, sometimes baby's breath, all arranged differently. It changes at 8:00 am her time (set `newDayHour` in `app.js`).
- The dots at the bottom let her look back at the last 7 days.
- It works offline once it's installed.

## 1. Personalize (2 minutes)

Open `app.js` and edit the top three lines:

```js
herName: "beautiful",     // her name or a nickname: "Good morning, ___"
fromName: "Marcel",       // how every note is signed
firstDay: "2026-11-18",   // the day you give it to her
```

## 2. Put it online (free, same as Stack)

1. Make a new GitHub repo (pick a name that's hard to guess, like `roses-for-j-4821`).
2. Upload everything in this folder to it.
3. Go to Settings → Pages → Source: **Deploy from a branch** → `main` / root → Save.
4. In about a minute it's live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## 3. Get it onto her phone

Send her the link. Then:
- **iPhone:** open it in Safari → Share → **Add to Home Screen**.
- **Android:** open it in Chrome → ⋮ menu → **Add to Home screen** / **Install app**.

A rose icon called "Roses" shows up on her home screen, and the app opens full-screen like a regular app.

## 4. Sending her notes

Everything goes in `notes.json`. You can edit it from your phone on github.com (open the file → pencil icon → Commit).

```json
{
  "notes": {
    "2026-11-21": "Today's note goes here.",
    "2026-11-22": "You can schedule notes ahead of time too."
  },
  "backup": [
    "Shown on days you didn't write anything.",
    "Write a few of these so a day is never empty."
  ]
}
```

- Dates are `YYYY-MM-DD`. Each note shows up on that day.
- Use `\n` inside a note for a line break.
- Watch your commas and quotes. If the JSON breaks, the notes stop showing. Paste it into jsonlint.com if you're unsure.
- GitHub Pages can take a few minutes to update after you save.

## Pick-up messages

The little messages that pop up when she picks a flower live under `"whispers"` in `notes.json`. Add, change or delete any of them.

## Special bouquets (sunflowers!)

Roses are the everyday flower. To pick a specific bouquet for a day, add it under `"bouquets"` in `notes.json`:

```json
"bouquets": {
  "2026-11-20": "Sunflowers"
}
```

Options: `Autumn Sunrise` (orange tiger lilies, golden lilies, sunflowers, red and peach roses in a glass vase), `Sorbet & Gardenias` (gardenias with peach, lavender, coral and yellow roses in a glass vase), `Roses in a Vase` (pink, white and red roses with eucalyptus in a glass vase), `Lilies & Roses` (pink lilies, roses and eucalyptus in a glass vase), `Sunflowers`, `Sunshine` (sunflowers + white roses), `Sunset` (sunflowers + red roses), or any rose mix: `Classic Red`, `Blush`, `Ivory`, `Red & Ivory`, `Blush & Ivory`, `Red & Blush`, `All Three`, `Garden Party`, `Be Mine`, `First Snow`, `Cotton Candy`.

## Previewing a day

Add `?day=YYYY-MM-DD` to the link to see any day's bouquet, like `.../?day=2026-12-25`. It's handy for checking what she'll get.

## What's in here

- `index.html`, `style.css`: the page
- `app.js`: settings, daily bouquet recipe, notes, envelope
- `bouquet3d.js`: the 3D roses and interactions (built with three.js)
- `vendor/three.js`: the 3D engine, bundled so it works offline
- `notes.json`: your notes
- `sw.js`, `manifest.json`, `icons/`: make it installable and work offline

## Good to know

- **Privacy:** a free GitHub Pages site is public. Anyone with the exact link can see the notes. A random repo name keeps it practically private, but don't put anything in there you'd hate a stranger to read.
- **Changing the app:** if you edit the code (colors, layout, etc.), bump the version in `sw.js` (`roses-v2` → `roses-v3`) so her phone picks up the update.
- **To tweak it with Claude Code:** open this folder and describe what you want, like "make every bouquet all red on Valentine's Day", "let her pull a rose out and hold it", or "add a few tulips on her birthday".
