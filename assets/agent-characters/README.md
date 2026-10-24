# Agent characters: tomato, mushroom, bok choy, garlic, chef cat

Flat vector mascots with Grokbot-style transparent pill eyes, plus an animation demo.

## Contents
- `icons/*.svg|png` - final static icons, 1024x1024, transparent, centred, same optical scale. Eyes (and the cat's mouth) are real transparent cut-outs.
- `icons/characters.json` - every character split into layers for code use: `layers[0]` is the base body (eyes already removed from it), later layers are details drawn on top (stripes, hat, veins...), and `eyes[]` are two separate closed paths with centre points (`cx`,`cy`) in the 1024 viewBox.
- `demo/agents-alive.html` - self-contained animated demo (no dependencies). Open it in a browser.
- `source/originals/` - the original hand drawings and the Grokbot reference image.
- `source/scripts/` - Python used to vectorize and generate everything (see Notes).

## How the animation works (demo/agents-alive.html)
Each character is an inline `<svg viewBox="0 0 1024 1024">`:
- `<g class="body">` holds all coloured shapes. JS sets its `transform` each frame (breathing scale, sway rotate, hop translate, squash/stretch), pivoting at (512, 860).
- The first body path has `mask="url(#m-NAME)"`. The mask is a white rect plus the two `.eye` paths filled black, so the eyes cut through the base. JS moves/scales each `.eye` (gaze offset + blink as scaleY around its own `data-cx`/`data-cy`) so the eyes can animate independently of the body.
- One `requestAnimationFrame` loop drives per-character state: blink timer (with double blinks), glance timer, hop (anticipation -> launch -> land with spring squash), and pointer-following gaze.
- Personality lives in the `P` object at the top of the script: breathing (`br`,`bs`), sway (`sw`), hop interval/height (`hi`,`hh`), squash (`sq`), blink interval (`bk`), double-blink chance (`db`), glance interval (`gl`), eye travel (`er`), body lean (`ln`).
- `prefers-reduced-motion` disables hopping and swaying.

## Suggested next steps for a real app
- Wrap one character as a component, e.g. `<Agent name="tomato" state="idle" />`, using `characters.json` + the loop above.
- Add states beyond idle (thinking, happy, confused, speaking) driven by app events.
- For native/mobile, rebuild the same layers (body, details, eyes) in Rive or Lottie, or use react-native-svg + Reanimated/Skia.
- Optional: simplify the SVG paths (they are dense, Catmull-Rom sampled) if file size matters.

## Design rules to preserve
- Flat colours only: no gradients, shadows, outlines, or textures.
- Eyes: simple solid transparent pills, front-facing, level and centred. Tomato eyes lean inward (about 27 degrees); garlic, bok choy, mushroom and cat are straight. Bok choy eyes are the widest. Slight size differences between left and right are intentional.
- Keep the hand-drawn silhouettes; do not round or symmetrize them.

## Notes on the scripts
`build.py` (vegetables), `build_cat.py` (cat), `anim.py` + `tpl.html` (demo generator). They use absolute paths under `/mnt/user-data/` and need `numpy scipy scikit-image pillow opencv-python potracer cairosvg`. Eye geometry is the `eyes=[(cx,cy,height,w_top,w_bottom,tilt_deg), ...]` entry in each config, in 2048px source coordinates.
