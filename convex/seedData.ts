// Owner: Role 4 (menu), Role 3 (traps + profiles). Hand-checked demo data.
// SEED_MENU is the fallback snapshot agents use whenever the Apify ingest hasn't run or failed.
// TODO(Role 4 + Role 2): replace with the chosen real restaurant once picked; refresh from a real ingest run.
import { ALLERGENS, type Allergen, type Diet } from "./shared/enums";
import type { NormalizedItem } from "./menu";

export const DEMO_RESTAURANT = {
  name: "Tappy Kitchen (demo)",
};
export const DEMO_HOST_DEVICE = "demo-restaurant";

type Row = {
  name: string; category: string; cuisine?: string; price: number; description: string; tags: string[];
  contains?: Allergen[]; may?: Allergen[]; diet?: Diet[]; spice?: number; drink?: boolean; share?: boolean;
};

const ROWS: Row[] = [
  // Shareables. The paella and shrimp are the demo's "dropped for the table" traps.
  { name: "Seafood Paella", category: "shareables", cuisine: "Spanish", price: 2800, description: "Saffron rice, prawns, mussels, squid", tags: ["rice", "seafood", "saffron"], contains: ["shellfish", "fish"], diet: ["no_pork"], share: true },
  { name: "Garlic Butter Shrimp", category: "shareables", cuisine: "Spanish", price: 1600, description: "Sizzling shrimp, garlic, chili, butter", tags: ["seafood", "garlic", "spicy"], contains: ["shellfish", "milk"], diet: ["no_pork"], spice: 2, share: true },
  { name: "Chicken Satay", category: "shareables", cuisine: "Thai", price: 1400, description: "Grilled chicken skewers, peanut sauce", tags: ["grilled", "chicken", "skewers"], contains: ["peanut", "soy"], diet: ["no_pork", "halal"], spice: 1, share: true },
  { name: "Margherita Flatbread", category: "shareables", cuisine: "Italian", price: 1500, description: "Tomato, mozzarella, basil", tags: ["cheesy", "flatbread", "pizza"], contains: ["wheat", "gluten", "milk"], diet: ["vegetarian", "no_pork", "halal"], share: true },
  { name: "Hummus & Warm Pita", category: "shareables", cuisine: "Mediterranean", price: 1100, description: "Chickpea hummus, olive oil, pita", tags: ["dip", "chickpea", "bread"], contains: ["sesame", "wheat", "gluten"], diet: ["vegan", "vegetarian", "halal", "no_pork"], share: true },
  { name: "Salted Edamame", category: "shareables", cuisine: "Japanese", price: 700, description: "Steamed soybeans, sea salt", tags: ["light", "beans", "healthy"], contains: ["soy"], diet: ["vegan", "vegetarian", "halal", "no_pork"], share: true },
  { name: "Crispy Brussels Sprouts", category: "shareables", cuisine: "American", price: 1000, description: "Fried sprouts, balsamic glaze", tags: ["crispy", "vegetables", "fried"], may: ["tree_nut"], diet: ["vegan", "vegetarian", "halal", "no_pork"], share: true },
  { name: "Korean Fried Chicken", category: "shareables", cuisine: "Korean", price: 1700, description: "Double-fried wings, gochujang glaze", tags: ["fried", "chicken", "spicy"], contains: ["wheat", "gluten", "soy", "sesame", "egg"], diet: ["no_pork"], spice: 3, share: true },
  { name: "Truffle Fries", category: "shareables", cuisine: "American", price: 900, description: "Shoestring fries, truffle salt", tags: ["fried", "potato", "crispy"], may: ["milk"], diet: ["vegan", "vegetarian", "halal", "no_pork"], share: true },
  // Mains
  { name: "Pad Thai", category: "mains", cuisine: "Thai", price: 1800, description: "Rice noodles, tamarind, egg, crushed peanuts", tags: ["noodles", "tangy", "peanut"], contains: ["peanut", "egg", "fish", "soy"], diet: ["no_pork"], spice: 1 },
  { name: "Tofu Green Curry", category: "mains", cuisine: "Thai", price: 1700, description: "Coconut green curry, tofu, jasmine rice", tags: ["curry", "spicy", "rice"], contains: ["soy"], may: ["peanut"], diet: ["vegan", "vegetarian", "halal", "no_pork"], spice: 3 },
  { name: "Pesto Pasta", category: "mains", cuisine: "Italian", price: 1900, description: "Basil pine-nut pesto, parmesan, linguine", tags: ["pasta", "cheesy", "herby"], contains: ["tree_nut", "milk", "wheat", "gluten"], diet: ["vegetarian", "no_pork", "halal"] },
  { name: "Grilled Salmon Bowl", category: "mains", cuisine: "Japanese", price: 2300, description: "Miso salmon, rice, cucumber, sesame", tags: ["grilled", "rice", "seafood", "healthy"], contains: ["fish", "soy", "sesame"], diet: ["no_pork"] },
  { name: "Chicken Shawarma Plate", category: "mains", cuisine: "Mediterranean", price: 2000, description: "Spiced chicken, rice, garlic yogurt, pita", tags: ["grilled", "chicken", "rice"], contains: ["milk", "wheat", "gluten", "sesame"], diet: ["halal", "no_pork"], spice: 1 },
  { name: "Pork Belly Bao", category: "mains", cuisine: "Taiwanese", price: 1800, description: "Braised pork belly, pickles, steamed buns", tags: ["pork", "buns", "savory"], contains: ["wheat", "gluten", "soy", "sesame"], spice: 1 },
  { name: "Beef Pho", category: "mains", cuisine: "Vietnamese", price: 1900, description: "Rice noodles, brisket, herb broth", tags: ["noodles", "soup", "beef"], contains: ["fish"], may: ["soy", "wheat"], diet: ["no_pork"] },
  { name: "Falafel Wrap", category: "mains", cuisine: "Mediterranean", price: 1500, description: "Falafel, tahini, pickles, lavash", tags: ["wrap", "chickpea", "crispy"], contains: ["sesame", "wheat", "gluten"], diet: ["vegan", "vegetarian", "halal", "no_pork"] },
  { name: "Mushroom Risotto", category: "mains", cuisine: "Italian", price: 2100, description: "Arborio rice, wild mushrooms, parmesan", tags: ["rice", "cheesy", "mushroom"], contains: ["milk"], diet: ["vegetarian", "halal", "no_pork"] },
  { name: "Spicy Bibimbap", category: "mains", cuisine: "Korean", price: 1900, description: "Rice, vegetables, beef, fried egg, gochujang", tags: ["rice", "spicy", "beef"], contains: ["egg", "soy", "sesame"], may: ["wheat"], diet: ["no_pork"], spice: 3 },
  { name: "Garden Salad", category: "sides", cuisine: "American", price: 900, description: "Greens, cucumber, lemon vinaigrette", tags: ["light", "healthy", "salad"], diet: ["vegan", "vegetarian", "halal", "no_pork"] },
  // Drinks
  { name: "Thai Iced Tea", category: "drinks", cuisine: "Thai", price: 600, description: "Black tea, condensed milk", tags: ["sweet", "tea"], contains: ["milk"], diet: ["vegetarian", "halal", "no_pork"], drink: true },
  { name: "Mango Lassi", category: "drinks", cuisine: "Indian", price: 650, description: "Mango, yogurt, cardamom", tags: ["sweet", "fruity"], contains: ["milk"], diet: ["vegetarian", "halal", "no_pork"], drink: true },
  { name: "Fresh Lemonade", category: "drinks", price: 500, description: "Lemon, cane sugar, mint", tags: ["fresh", "citrus"], diet: ["vegan", "vegetarian", "halal", "no_pork"], drink: true },
  { name: "Almond Horchata", category: "drinks", cuisine: "Mexican", price: 600, description: "Rice and almond milk, cinnamon", tags: ["sweet", "creamy"], contains: ["tree_nut"], diet: ["vegan", "vegetarian", "halal", "no_pork"], drink: true },
  { name: "Iced Oat Matcha", category: "drinks", cuisine: "Japanese", price: 650, description: "Matcha, oat milk", tags: ["tea", "creamy"], may: ["gluten", "wheat"], diet: ["vegan", "vegetarian", "halal", "no_pork"], drink: true },
  { name: "Sparkling Water", category: "drinks", price: 400, description: "Chilled sparkling water", tags: ["fresh"], diet: ["vegan", "vegetarian", "halal", "no_pork"], drink: true },
  // Desserts
  { name: "Mochi Ice Cream", category: "desserts", cuisine: "Japanese", price: 800, description: "Three mochi, assorted flavors", tags: ["sweet", "cold"], contains: ["milk", "soy"], diet: ["vegetarian", "halal", "no_pork"], share: true },
  { name: "Baklava", category: "desserts", cuisine: "Mediterranean", price: 900, description: "Filo, pistachio, honey", tags: ["sweet", "flaky"], contains: ["tree_nut", "wheat", "gluten", "milk"], diet: ["vegetarian", "halal", "no_pork"], share: true },
];

export const SEED_MENU: NormalizedItem[] = ROWS.map((r, i) => ({
  name: r.name,
  category: r.category,
  cuisine: r.cuisine,
  tags: r.tags,
  description: r.description,
  priceCents: r.price,
  allergens: ALLERGENS.map((allergen) => ({
    allergen,
    level: r.contains?.includes(allergen) ? "contains" : r.may?.includes(allergen) ? "may_contain" : "not_detected",
  })),
  diet: r.diet ?? [],
  spice: r.spice ?? 0,
  isDrink: !!r.drink,
  shareable: !!r.share,
  menuOrder: i,
  tagStatus: "tagged",
}));

/** The untagged source menu, as a scraper would return it. Sent to the normalizer Actor when no scraper is set. */
export const RAW_MENU = ROWS.map((r) => ({
  name: r.name, description: r.description, price: `$${(r.price / 100).toFixed(2)}`, category: r.category,
}));

/** The 4 teammate personas, one per demo phone (deviceId baked into each phone's Debug settings). */
export const SEED_USERS = [
  { deviceId: "demo-diner-1", name: "Maya", allergies: ["shellfish"], diet: [], spice: 3, likes: ["noodles", "spicy", "curry"], dislikes: ["mushroom"], cuisines: ["Thai", "Japanese"], dislikedCuisines: ["Italian", "Mexican", "Mediterranean"], likedCategories: ["mains", "shareables", "drinks", "desserts"], personality: "adventurous", avatarId: "avatar_1" },
  { deviceId: "demo-diner-2", name: "Leo", allergies: ["peanut", "tree_nut"], diet: [], spice: 2, likes: ["fried", "chicken", "crispy"], dislikes: ["salad"], cuisines: ["Mexican", "Thai"], dislikedCuisines: ["Italian", "Japanese", "Mediterranean"], likedCategories: ["shareables", "mains"], personality: "budget_minded", avatarId: "avatar_2" },
  { deviceId: "demo-diner-3", name: "Priya", allergies: [], diet: ["vegetarian"], spice: 1, likes: ["cheesy", "pasta"], dislikes: ["spicy", "seafood", "beef"], cuisines: ["Italian", "Mediterranean"], dislikedCuisines: ["Thai", "Japanese", "Mexican"], likedCategories: ["mains"], personality: "picky", avatarId: "avatar_3" },
  { deviceId: "demo-diner-4", name: "Sam", allergies: ["gluten"], diet: [], spice: 2, likes: ["rice", "seafood", "grilled"], dislikes: [], cuisines: ["Japanese", "Mediterranean"], dislikedCuisines: ["Thai", "Italian", "Mexican"], likedCategories: ["mains", "shareables"], personality: "adventurous", avatarId: "avatar_4" },
] as const;
