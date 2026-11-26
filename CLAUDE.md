# Matplanering

## Design

All design work starts from the clickable prototype in Claude Design:

- Canvas: https://claude.ai/artifact/3c2dFn8R36KAEqeHLJ78Mm
- Source files: `design/project/*.dc.html` + `design/project/canvas.json` (see `design/README.md` for the screen → `src/` map and tokens)

When a conversation is about design, layout, a new screen or a UI change:

1. Read the relevant `design/project/*.dc.html` file(s) first and use them as the baseline.
2. Make the design change in those files and republish to the same canvas URL (Artifact publish with `url` above, `root` = `design`).
3. If the canvas may have been edited by hand, read it back from the canvas before editing and save it here.
4. After implementing a UI change in `src/`, update the matching artboard so the prototype keeps mirroring the app.
