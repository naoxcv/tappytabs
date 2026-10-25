import type { AgentName } from "./characters/data";
import type { Placement } from "./characters/pose";

type Layout = Record<AgentName, Placement>;

// Scene hand-off positions (feet, frame px). See STORYBOARD.md "Shared layouts".
export const ROW: Layout = {
  bokchoy: { x: 440, y: 1010, size: 380 },
  tomato: { x: 700, y: 1010, size: 380 },
  mushroom: { x: 960, y: 1010, size: 380 },
  garlic: { x: 1220, y: 1010, size: 380 },
  cat: { x: 1480, y: 1010, size: 380 },
};

// Leaves the centre (~560-1360 x 520-860) clear for dish cards and room above each agent for a bubble.
export const TABLE: Layout = {
  tomato: { x: 400, y: 640, size: 400 },
  bokchoy: { x: 640, y: 1000, size: 400 },
  cat: { x: 960, y: 470, size: 380 },
  mushroom: { x: 1280, y: 1000, size: 400 },
  garlic: { x: 1520, y: 640, size: 400 },
};

// Around the group-order panel (x 640-1280); the cat hosts beside it.
export const ORDER: Layout = {
  tomato: { x: 290, y: 950, size: 370 },
  bokchoy: { x: 520, y: 1040, size: 370 },
  mushroom: { x: 1420, y: 1040, size: 370 },
  garlic: { x: 1650, y: 950, size: 370 },
  cat: { x: 1640, y: 540, size: 340 },
};

export const LINEUP: Layout = {
  bokchoy: { x: 580, y: 980, size: 300 },
  tomato: { x: 770, y: 980, size: 300 },
  cat: { x: 960, y: 995, size: 320 },
  mushroom: { x: 1150, y: 980, size: 300 },
  garlic: { x: 1340, y: 980, size: 300 },
};
