import type { AgentName } from "./characters/data";

// The app's demo party (ios/TappyTabs/Core/Mocks/party_confirm.json + lines_confirm.json).
// avatar_1..4 map to tomato, mushroom, bok choy, garlic in AvatarCatalog.
export const DINERS: { agent: AgentName; name: string; dish: string; priceCents: number; reason: string }[] = [
  { agent: "tomato", name: "Maya", dish: "Tofu Green Curry", priceCents: 1700, reason: "Matches Maya’s love of spicy" },
  { agent: "mushroom", name: "Leo", dish: "Falafel Wrap", priceCents: 1500, reason: "Light, so there’s room to share" },
  { agent: "bokchoy", name: "Priya", dish: "Pesto Pasta", priceCents: 1900, reason: "No shellfish, as asked" },
  { agent: "garlic", name: "Sam", dish: "Grilled Salmon Bowl", priceCents: 2300, reason: "Matches Sam’s usual" },
];

export const SHARED: { dish: string; priceCents: number }[] = [
  { dish: "Salted Edamame", priceCents: 700 },
  { dish: "Truffle Fries", priceCents: 900 },
];

export const DINER_AGENTS = DINERS.map((d) => d.agent);
export const DISH_COUNT = DINERS.length + SHARED.length;
export const TABLE_TOTAL_CENTS = [...DINERS, ...SHARED].reduce((n, d) => n + d.priceCents, 0);
export const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
