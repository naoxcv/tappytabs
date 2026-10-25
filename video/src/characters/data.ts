import raw from "../assets/characters.json";

export type AgentName = "tomato" | "mushroom" | "bokchoy" | "garlic" | "cat";
export const CAST: AgentName[] = ["bokchoy", "tomato", "mushroom", "garlic", "cat"];

type Layer = { fill: string; d: string };
type Eye = { cx: number; cy: number; d: string };
export type CharacterArt = { layers: Layer[]; eyes: Eye[]; eyeLine: number };

const json = raw as unknown as Record<AgentName, { layers: Layer[]; eyes: Eye[] }>;

export const ART: Record<AgentName, CharacterArt> = Object.fromEntries(
  CAST.map((n) => {
    const { layers, eyes } = json[n];
    return [n, { layers, eyes, eyeLine: (eyes[0].cy + eyes[1].cy) / 2 }];
  }),
) as Record<AgentName, CharacterArt>;

// Feet pivot inside the 1024 viewBox; every placement in the video anchors here.
export const PIVOT = { x: 512, y: 860 };

// Per-character energy, carried over from demo/agents-alive.html.
// br/bs breathing amount/speed, sw sway deg, sq squash, bk blink interval (s),
// db double-blink chance, er eye travel (viewBox units), ln lean toward gaze (deg).
export const PERSONALITY: Record<
  AgentName,
  { br: number; bs: number; sw: number; sq: number; bk: [number, number]; db: number; er: number; ln: number }
> = {
  tomato: { br: 0.012, bs: 2.2, sw: 1.2, sq: 0.16, bk: [2, 4.5], db: 0.2, er: 16, ln: 4 },
  mushroom: { br: 0.008, bs: 1.1, sw: 0.5, sq: 0.08, bk: [3.5, 7], db: 0.05, er: 12, ln: 2.5 },
  bokchoy: { br: 0.01, bs: 1.4, sw: 3, sq: 0.1, bk: [2.5, 5.5], db: 0.1, er: 14, ln: 3 },
  garlic: { br: 0.01, bs: 1.8, sw: 1.6, sq: 0.12, bk: [1.5, 4], db: 0.4, er: 18, ln: 3.5 },
  cat: { br: 0.011, bs: 1.7, sw: 2.2, sq: 0.13, bk: [1.8, 4.5], db: 0.3, er: 15, ln: 3.5 },
};

// Accent per agent, from ios AgentAvatarConfig, used for chip dots.
export const ACCENT: Record<AgentName, string> = {
  tomato: "#b13e3e",
  mushroom: "#a67a5e",
  bokchoy: "#5a945c",
  garlic: "#a682b3",
  cat: "#d9944d",
};
