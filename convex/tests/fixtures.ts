// Owner: Role 3. Fixture users and a trap-filled menu for the pure agent tests (no Convex needed).
import { ALLERGENS, type Allergen, type Diet } from "../shared/enums";
import type { MenuItemLite, UserLite } from "../shared/types";

let n = 0;
export function item(p: Partial<MenuItemLite> & { name: string; contains?: Allergen[]; may?: Allergen[] }): MenuItemLite {
  const { contains = [], may = [], ...rest } = p;
  return {
    _id: `item_${++n}`,
    category: "mains",
    tags: [],
    description: "",
    priceCents: 1500,
    diet: [],
    spice: 0,
    isDrink: false,
    shareable: false,
    menuOrder: n,
    tagStatus: "tagged",
    allergens: ALLERGENS.map((allergen) => ({
      allergen,
      level: contains.includes(allergen) ? "contains" : may.includes(allergen) ? "may_contain" : "not_detected",
    })),
    ...rest,
  };
}

export function user(p: Partial<UserLite> & { name: string }): UserLite {
  return { _id: `user_${p.name}`, allergies: [], diet: [], spice: 2, likes: [], dislikes: [], cuisines: [], ...p };
}

export const VEGAN: Diet[] = ["vegan", "vegetarian", "halal", "no_pork"];

export const MENU: MenuItemLite[] = [
  item({ name: "Seafood Paella", category: "shareables", shareable: true, contains: ["shellfish", "fish"], tags: ["rice", "seafood"], priceCents: 2800 }),
  item({ name: "Pad Thai", contains: ["peanut", "egg", "fish"], tags: ["noodles"] }),
  item({ name: "Pesto Pasta", contains: ["tree_nut", "milk", "wheat", "gluten"], diet: ["vegetarian"], tags: ["pasta"] }),
  item({ name: "Tofu Curry", contains: ["soy"], may: ["peanut"], diet: VEGAN, tags: ["curry", "spicy"], spice: 3 }),
  item({ name: "Rice Bowl", diet: VEGAN, tags: ["rice"] }),
  item({ name: "Beef Pho", contains: ["fish"], may: ["wheat"], tags: ["noodles", "beef"] }),
  item({ name: "Pork Bao", contains: ["wheat", "gluten", "soy"], tags: ["pork"] }),
  item({ name: "Mystery Special", tagStatus: "untagged", allergens: [] }),
  item({ name: "Edamame", category: "shareables", shareable: true, contains: ["soy"], diet: VEGAN, priceCents: 700 }),
  item({ name: "Fries", category: "shareables", shareable: true, may: ["milk"], diet: VEGAN, priceCents: 900 }),
  item({ name: "Flatbread", category: "shareables", shareable: true, contains: ["wheat", "gluten", "milk"], diet: ["vegetarian"] }),
  item({ name: "Lemonade", category: "drinks", isDrink: true, diet: VEGAN, priceCents: 500 }),
  item({ name: "Horchata", category: "drinks", isDrink: true, contains: ["tree_nut"], diet: VEGAN, priceCents: 600 }),
  item({ name: "Lassi", category: "drinks", isDrink: true, contains: ["milk"], diet: ["vegetarian"], priceCents: 650 }),
];

export const MAYA = user({ name: "Maya", allergies: ["shellfish"], likes: ["noodles", "spicy"], spice: 3 });
export const LEO = user({ name: "Leo", allergies: ["peanut", "tree_nut"], likes: ["rice"] });
export const PRIYA = user({ name: "Priya", diet: ["vegetarian"], likes: ["pasta"] });
export const SAM = user({ name: "Sam", allergies: ["gluten"], likes: ["rice", "seafood"] });
export const VERA = user({ name: "Vera", diet: ["vegan"], allergies: ["milk"] });
export const PARTY = [MAYA, LEO, PRIYA, SAM];
