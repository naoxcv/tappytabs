// Owner: Role 3. Allergen + diet keyword dictionary used by the normalizer's first (deterministic) pass.
// Keyword hits set "contains"; the LLM pass may only ADD or RAISE levels, never lower them.
export const ALLERGENS = [
  "milk", "egg", "fish", "shellfish", "tree_nut", "peanut", "wheat", "soy", "sesame", "gluten",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_KEYWORDS: Record<Allergen, string[]> = {
  milk: ["milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "parmesan", "mozzarella", "ghee", "lassi", "paneer", "ricotta", "feta", "condensed"],
  egg: ["egg", "mayo", "mayonnaise", "aioli", "custard", "meringue"],
  fish: ["fish", "salmon", "tuna", "cod", "anchovy", "fish sauce", "bonito", "mackerel", "tilapia", "pho"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "scallop", "squid", "calamari", "paella", "seafood"],
  tree_nut: ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "pine nut", "pine-nut", "macadamia", "pesto", "praline", "baklava"],
  peanut: ["peanut", "satay", "groundnut"],
  wheat: ["wheat", "flour", "bread", "pita", "naan", "bun", "bao", "noodle", "pasta", "linguine", "spaghetti", "tortilla", "wrap", "lavash", "flatbread", "breaded", "tempura", "panko", "soy sauce", "dumpling", "filo"],
  soy: ["soy", "tofu", "edamame", "miso", "tempeh", "soy sauce", "gochujang"],
  sesame: ["sesame", "tahini", "hummus", "falafel"],
  gluten: ["gluten", "wheat", "barley", "rye", "seitan", "flour", "bread", "pita", "pasta", "noodle", "bun", "bao", "beer"],
};

/** Words that mean an item is NOT vegetarian (fail closed). */
export const MEAT_KEYWORDS = ["chicken", "beef", "pork", "lamb", "bacon", "ham", "sausage", "duck", "turkey", "brisket", "belly", "chorizo", "veal", "goat"];
export const PORK_KEYWORDS = ["pork", "bacon", "ham", "chorizo", "prosciutto", "pancetta", "lard", "belly"];
export const DRINK_CATEGORIES = /(drink|beverage|tea|coffee|juice|soda|smoothie|lemonade|cocktail|beer|wine)/i;
export const SHAREABLE_CATEGORIES = /(share|starter|appetizer|small plate|tapas|snack|side|platter)/i;

export function keywordHits(text: string): Set<Allergen> {
  const t = ` ${text.toLowerCase()} `;
  const out = new Set<Allergen>();
  for (const a of ALLERGENS) {
    if (ALLERGEN_KEYWORDS[a].some((k) => t.includes(k))) out.add(a);
  }
  // Rice noodles are not wheat; the LLM pass can re-raise if the description says otherwise.
  if (/rice noodle/.test(t) && !/(wheat|flour|egg noodle)/.test(t)) { out.delete("wheat"); out.delete("gluten"); }
  return out;
}
