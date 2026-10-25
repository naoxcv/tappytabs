# TappyTabs launch video — storyboard

**Format:** 1920×1080, 30 fps, 38 s (1140 frames). Charcoal `#262626` background, cream `#FFF5DB` type.
Headings in Raleway (700–800), body/UI in Open Sans (400–600).

**Cast** (original layered artwork from `assets/agent-characters/icons/characters.json`; transparent pill eyes are masked cut-outs, so the charcoal shows through):

| Agent | Diner's taste | Personality in motion |
|---|---|---|
| Tomato | Loves spicy | Eager. First to peek, quick springy moves, big squash, often leans in. |
| Mushroom | Something to share | Calm and warm. Slow and deliberate, rarely blinks twice, small nods. |
| Bok choy | No shellfish (allergy) | Careful. Wide eyes, a little sway, tilts its head while thinking. |
| Garlic | Easygoing | Curious and twitchy. Fast glances, frequent double blinks, overshoots. |
| Chef cat | Host (the restaurant's agent) | Confident. Arrives last with a hop, takes the top-centre hosting spot. |

**Coordinates:** each character is placed by its *feet* (viewBox point 512, 860) in 1920×1080 space. "Size" is the rendered width of the 1024 box.
Gaze is written as `→ target`. Default idle: breathing, gentle sway, randomized deterministic blinks (seeded per character).

---

## Shared layouts (scene hand-off points)

These are fixed positions, so each scene starts exactly where the previous one ended.

| Layout | Bok choy | Tomato | Mushroom | Garlic | Cat |
|---|---|---|---|---|---|
| `ROW` (standing at bottom, size 380) | 440, 1010 | 700, 1010 | 960, 1010 | 1220, 1010 | 1480, 1010 |
| `TABLE` (conversation, size 400, cat 380) | 640, 1000 | 400, 640 | 1280, 1000 | 1520, 640 | 960, 470 |
| `ORDER` (around order panel, size 370, cat 340) | 590, 1040 | 330, 1000 | 1330, 1040 | 1590, 1000 | 1660, 540 |
| `LINEUP` (closing, size 300, cat 320) | 580, 980 | 770, 980 | 1150, 980 | 1340, 980 | 960, 995 |

The art fills roughly half of its 1024 box, so a size of 400 reads as a character about 200 px tall.
In `TABLE`, the upper corners go to Tomato (left) and Garlic (right), the lower corners to Bok choy (left) and Mushroom (right), and the Cat hosts at top centre. Nobody's swoop path crosses another's.
`TABLE` leaves the centre (≈ 640–1280 × 560–900) clear for dish cards and keeps space above each agent for a speech bubble.

---

## 1. Opening — the agents arrive (0:00–0:06, frames 0–180) · composition `Entrance`

| Frames | What happens |
|---|---|
| 0–12 | Empty charcoal canvas. |
| 10–36 | Headline **"Different tastes. One table."** fades in and rises 18 px to centre (y ≈ 330). Raleway 800, 92 px, cream. |
| 30–52 | **Tomato** peeks up at x 700: only its eyes and the top of its body clear the bottom edge. A spring with a small overshoot, then it settles. Eyes look up toward the headline. |
| 62 | Tomato blinks. |
| 58–84 | **Mushroom** rises beside it at x 960, slower and higher (up to its shoulders). |
| 90–100 | Tomato's gaze → Mushroom and it tilts 6° toward it. Mushroom's gaze → Tomato, a slight tilt back. A beat to read the glance. |
| 104 | Tomato double-blinks, Mushroom gives a tiny nod (a squash dip). |
| 120–140 | **Bok choy** pops up at x 440 with a quick spring and a wide-eyed look around. |
| 132–152 | **Garlic** pops up at x 1220 with more overshoot, eyes darting left and right. |
| 146–172 | **Chef cat** rises last at x 1480 with a confident bob. Every other agent's gaze → Cat. |

## 2. Gathering — meet at the table (0:06–0:11, frames 180–330) · composition `Entrance` (continued)

| Frames | What happens |
|---|---|
| 165–185 | Headline drifts up 24 px and fades out. |
| 180–210 | Anticipation: each agent dips 18 px, then rises fully into `ROW` with a stretch, landing on a squash. Staggered 4 frames apart, left to right. |
| 205–268 | **Swoop.** Each agent follows a curved quadratic path from `ROW` to `TABLE`, leaning into the direction of travel and stretching with speed. Order: Tomato, Garlic, Mushroom, Bok choy, then Cat, which arcs high and lands at the top-centre host spot with a small hop. Everyone lands on a squash. |
| 268–282 | Settle. Gaze → Cat, the host. Cat blinks slowly. |
| 272–318 | **Preference chips** pop in next to their owners (scale 0.9 → 1, fade, restrained ease): "Loves spicy" (Tomato, right side), "Something to share" (Mushroom, above), "No shellfish" (Bok choy, above). Each owner does a small lift as its chip appears. |
| 312–330 | Chips shrink back into their owners and fade out. Gaze → Tomato, which is about to speak. |

**Hand-off:** all five agents are in `TABLE` positions with gaze → Tomato.

## 3. Conversation — make a decision together (0:11–0:23, frames 330–690) · composition `Conversation`

There is one primary speaker at a time. The speaker lifts 10 px and leans 4°. Others turn their gaze to the speaker, blink, and react with small nods or tilts.
Bubbles are anchored above their speaker (with a tail pointing at it), Open Sans 600, 34 px, charcoal text on a cream bubble. Each one stays up for at least 2.2 s.

| Frames | Speaker | Line | Listener reactions |
|---|---|---|---|
| 342–422 | Tomato | "Something spicy for me." | Garlic nods twice. Mushroom tilts its head. |
| 434–514 | Mushroom | "And something we can share?" | Tomato bounces, Cat blinks. |
| 524–604 | Bok choy | "Keep the shellfish allergy in mind." | Others look at it gravely, then nod. Tomato gives a small "oops" lean back. |
| 614–676 | Chef cat | "I've got a plan." | Everyone looks at the Cat. It does a proud hop. |

**Emerging decision (626–690):** while the Cat speaks, three dish cards slide out from behind it into the centre gap, staggered by 10 frames, with an eased fade and a light float. They settle at (690, 560), (960, 645) and (1230, 560), tilted −4°, 0° and 4°. Each card shows its tag, dish, price and the faces of the agents it's for.
- Tofu Green Curry · $17 · *spicy* (tags Tomato)
- Salted Edamame · $7 · *to share* (tags Mushroom)
- Truffle Fries · $9 · *to share* (tags everyone)

Bok choy glances at each card in turn (frames 644 / 656 / 668) and a green "✓ No shellfish" line opens on it. Bok choy then nods.

**Hand-off:** agents in `TABLE`, three cards clustered in the centre.

## 4. Decision — the plan comes together (0:23–0:31, frames 690–930) · composition `Decision`

Built from the app's group order (`GroupOrderView` / `OrderPlacedView`) using the demo party from the iOS mocks. avatar_1–4 map to Maya (Tomato), Leo (Mushroom), Priya (Bok choy) and Sam (Garlic).

| Frames | What happens |
|---|---|
| 690–730 | A **"Group order · Tappy Kitchen"** panel fades in at the centre (x 640–1280). The three cards fly into their rows and dissolve into them: curry becomes Maya's line, edamame and fries become **For the table**. Leo's Falafel Wrap, Priya's Pesto Pasta and Sam's Grilled Salmon Bowl rows follow. The agents swoop from `TABLE` to `ORDER`, with the Cat arcing around the panel to its host spot on the right. |
| 740–762 | The camera pushes in to 1.1×. |
| 750–834 | Each diner row highlights in turn with its agent's reason in green: "Matches Maya's love of spicy", "Light, so there's room to share", "No shellfish, as asked", "Matches Sam's usual". The owner lifts and everyone looks at the row. |
| 830–856 | The camera eases back to 1.0. |
| 840–864 | **Confirmation:** a checkmark pops in each row and above each diner's agent, staggered 8 frames, as each agent hops. The Cat looks at each one in turn. Diners then glance at a neighbour. |
| 868–912 | The footer changes from "Waiting for everyone to confirm" to **"Everyone confirmed"** (table total $90). **"Your tastes. Everyone's choice."** fades in at the top. |

**Hand-off:** agents in `ORDER`, the panel fully confirmed, the headline up.

## 5. Closing — a shared result (0:31–0:38, frames 930–1140) · composition `Closing`

| Frames | What happens |
|---|---|
| 930–948 | The headline fades out and the head checkmarks shrink away. |
| 938–962 | The panel scales down and dissolves into a compact **"✓ Order confirmed"** card ("6 dishes · Table total $90 · Sent to the restaurant", plus the diners' faces). |
| 954–1022 | Agents hop on high arcs into `LINEUP`, from left to right. Chef cat comes in last to the centre spot with a landing hop. |
| 1014–1032 | The card lifts and fades. |
| 1030–1068 | **"TappyTabs"** (Raleway 800, 150 px, y 455) and **"Tap in. Let your agents talk."** (Open Sans 500, 44 px) fade in. The agents look up at the name, then face forward. |
| 1068–1140 | Hold (about 3.5 s from the title appearing): breathing, blinks, a shared glance between Tomato and Garlic, a small hop from Tomato, a nod from Mushroom and a slow blink from the Cat. |

---

## Animation rules
- All motion is a pure function of the frame (`useCurrentFrame`, `spring`, `interpolate`, seeded `random`). There is no wall-clock time, so preview and export match.
- Characters use spring entrances and reactions (slight overshoot). Text and UI use restrained eased fades and small translations.
- Squash and stretch are derived from velocity (stretch) and landing impulses (squash), capped at about 12%.
- Eyes animate independently: gaze offset plus blink as a scaleY around each eye's centre. Eye shape is never distorted beyond the blink.
- Each scene is its own composition (`Entrance`, `Conversation`, `Decision`, `Closing`), and `LaunchVideo` sequences them. Scenes share `layouts.ts`, so hand-offs line up exactly.
