# TappyTabs launch video

A Remotion project. Every pose is computed from the current frame (springs, eases, seeded randomness), so the Studio preview and the exported render are identical.

```sh
npm install
npm run studio            # preview in the browser
npm run render:entrance   # out/entrance.mp4
npm run render            # full LaunchVideo
npm run sync-assets       # re-copy characters.json and fonts from the app
npm run music             # regenerate public/audio/bgm.wav
```

- `STORYBOARD.md`: timing, positions, gaze, dialogue and UI for the whole video.
- `src/characters/`: `Agent` renders the layered SVG with masked pill eyes. `pose.ts` turns an `ActorScript` (path + looks/tilts/nods/hops/blinks) into per-frame poses.
- `src/layouts.ts`: shared scene hand-off positions.
- `src/scenes/`: one composition per scene. Played on its own, each scene uses the matching slice of the music.
- `scripts/make-music.mjs`: synthesizes the original background track (120 BPM, C major, marimba, glockenspiel, bass, claps). It follows the storyboard: an intro while the agents peek, a groove for the gathering, a softer section under the conversation, sparkle for the decision, and a cadence at 34 s as the title lands.
