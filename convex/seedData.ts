// Owner: Role 4 (menu), Role 3 (traps + profiles). Hand-checked demo data.
// SEED_MENU is the fallback snapshot agents use whenever the Apify ingest hasn't run or failed.
// TODO(Role 4 + Role 2): replace with the chosen real restaurant once picked; refresh from a real ingest run.
import type { NormalizedItem } from "./menu";
import rawMenu from "./fixtures/raw-menu.json";
import normalizedMenu from "./fixtures/normalized-menu.json";
import flourWaterMenu from "./fixtures/flour-water-menu.json";

export const DEMO_RESTAURANT = {
  name: "Tappy Kitchen (demo)",
};
export const DEMO_HOST_DEVICE = "demo-restaurant";

/** Fixture source and conservative fallback snapshot are checked in for repeatable seeds. */
export const RAW_MENU = rawMenu;
export const SEED_MENU = normalizedMenu as unknown as NormalizedItem[];
/** Flour + Water (SF) menu, hand-tagged from the restaurant's 10/22/26 dinner and dessert PDFs. */
export const FLOUR_WATER_MENU = flourWaterMenu as unknown as NormalizedItem[];

/** Ready-made restaurants an owner can skip onboarding into. */
export const DEMO_MENUS = {
  tappy: { name: DEMO_RESTAURANT.name, address: "Demo menu", items: SEED_MENU },
  flourWater: { name: "Flour + Water", address: "2401 Harrison St, San Francisco, CA", items: FLOUR_WATER_MENU },
} as const;

/** The 4 teammate personas, one per demo phone (deviceId baked into each phone's Debug settings). */
export const SEED_USERS = [
  { deviceId: "demo-diner-1", name: "Maya", allergies: ["shellfish"], diet: [], spice: 3, likes: ["noodles", "spicy", "curry"], dislikes: ["mushroom"], cuisines: ["Thai", "Japanese"], dislikedCuisines: ["Italian", "Mexican", "Mediterranean"], likedCategories: ["mains", "shareables", "drinks", "desserts"], personality: "adventurous", avatarId: "avatar_1" },
  { deviceId: "demo-diner-2", name: "Leo", allergies: ["peanut", "tree_nut"], diet: [], spice: 2, likes: ["fried", "chicken", "crispy"], dislikes: ["salad"], cuisines: ["Mexican", "Thai"], dislikedCuisines: ["Italian", "Japanese", "Mediterranean"], likedCategories: ["shareables", "mains"], personality: "budget_minded", avatarId: "avatar_2" },
  { deviceId: "demo-diner-3", name: "Priya", allergies: [], diet: ["vegetarian"], spice: 1, likes: ["cheesy", "pasta"], dislikes: ["spicy", "seafood", "beef"], cuisines: ["Italian", "Mediterranean"], dislikedCuisines: ["Thai", "Japanese", "Mexican"], likedCategories: ["mains"], personality: "picky", avatarId: "avatar_3" },
  { deviceId: "demo-diner-4", name: "Sam", allergies: ["gluten"], diet: [], spice: 2, likes: ["rice", "seafood", "grilled"], dislikes: [], cuisines: ["Japanese", "Mediterranean"], dislikedCuisines: ["Thai", "Italian", "Mexican"], likedCategories: ["mains", "shareables"], personality: "adventurous", avatarId: "avatar_4" },
] as const;
