// Owner: Role 3. PURE: no Convex, no network. The single source of truth for "is this dish OK for these people".
// Rules (see docs/IMPLEMENTATION_DESIGN.md §Role 3 "Safety rules"):
//  - contains            → unsafe
//  - may_contain         → personal: safe with askServer; shared: unsafe (a shared dish must be clean for every sharer)
//  - missing allergen row→ treated as may_contain
//  - gluten allergy also checks wheat
//  - diets are positive tags; a missing tag fails the diet
//  - untagged items (normalizer couldn't read them) are never *recommended* by agents; a diner may still add
//    one manually as a personal line, with askServer
import type { Allergen, AllergenLevel, Diet } from "../shared/enums";
import type { MenuItemLite, UserLite } from "../shared/types";

export type Safety = { safe: boolean; askServer: boolean; reasons: string[] };
export type SafetyMode = "personal" | "shared";
export type SafeItem<T extends MenuItemLite = MenuItemLite> = T & { askServer: boolean };

const RANK: Record<AllergenLevel, number> = { not_detected: 0, may_contain: 1, contains: 2 };

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  milk: "dairy", egg: "eggs", fish: "fish", shellfish: "shellfish", tree_nut: "tree nuts",
  peanut: "peanuts", wheat: "wheat", soy: "soy", sesame: "sesame", gluten: "gluten",
};

export function levelFor(item: Pick<MenuItemLite, "allergens">, allergen: Allergen): AllergenLevel {
  const find = (a: Allergen): AllergenLevel =>
    item.allergens.find((x) => x.allergen === a)?.level ?? "may_contain";
  const own = find(allergen);
  if (allergen !== "gluten") return own;
  const wheat = find("wheat");
  return RANK[wheat] > RANK[own] ? wheat : own;
}

export function dietOk(item: Pick<MenuItemLite, "diet">, diet: Diet): boolean {
  const has = (d: Diet) => item.diet.includes(d);
  switch (diet) {
    case "vegan": return has("vegan");
    case "vegetarian": return has("vegetarian") || has("vegan");
    case "halal": return has("halal") || has("vegetarian") || has("vegan");
    case "no_pork": return has("no_pork") || has("vegetarian") || has("vegan");
  }
}

/** Safe only if every user passes. `reasons` name the user and the problem, for bubbles and UNSAFE errors. */
export function isSafeFor(item: MenuItemLite, users: UserLite[], mode: SafetyMode = "personal"): Safety {
  const reasons: string[] = [];
  let safe = true;
  let askServer = item.tagStatus === "untagged" && users.some((u) => u.allergies.length > 0 || u.diet.length > 0);
  for (const user of users) {
    for (const allergen of user.allergies) {
      const level = levelFor(item, allergen);
      if (level === "contains") {
        safe = false;
        reasons.push(`${user.name} is allergic to ${ALLERGEN_LABEL[allergen]}`);
      } else if (level === "may_contain") {
        if (mode === "shared") {
          safe = false;
          reasons.push(`${user.name} is allergic to ${ALLERGEN_LABEL[allergen]} and it may contain some`);
        } else {
          askServer = true;
        }
      }
    }
    for (const diet of user.diet) {
      if (!dietOk(item, diet)) {
        safe = false;
        reasons.push(`${user.name} is ${diet.replace("_", " ")}`);
      }
    }
  }
  return { safe, askServer: safe && askServer, reasons };
}

/** Items an agent may recommend to this user as a personal main or drink. */
export function safeSet<T extends MenuItemLite>(menu: T[], user: UserLite): SafeItem<T>[] {
  const out: SafeItem<T>[] = [];
  for (const item of menu) {
    if (item.tagStatus !== "tagged") continue;
    const s = isSafeFor(item, [user], "personal");
    if (s.safe) out.push({ ...item, askServer: s.askServer });
  }
  return out;
}

/** Items an agent may propose for the whole table: shareable food, clean for every member. */
export function sharedSafeSet<T extends MenuItemLite>(menu: T[], users: UserLite[]): SafeItem<T>[] {
  const out: SafeItem<T>[] = [];
  for (const item of menu) {
    if (item.tagStatus !== "tagged" || item.isDrink || !item.shareable) continue;
    const s = isSafeFor(item, users, "shared");
    if (s.safe) out.push({ ...item, askServer: false });
  }
  return out;
}

/** Items a diner may add by hand (stage 2). Personal: includes may_contain/untagged with askServer. */
export function addableSet<T extends MenuItemLite>(menu: T[], me: UserLite, members: UserLite[], shared: boolean): SafeItem<T>[] {
  const out: SafeItem<T>[] = [];
  for (const item of menu) {
    if (shared) {
      if (item.isDrink || item.tagStatus !== "tagged") continue;
      const s = isSafeFor(item, members, "shared");
      if (s.safe) out.push({ ...item, askServer: false });
    } else {
      const s = isSafeFor(item, [me], "personal");
      if (s.safe) out.push({ ...item, askServer: s.askServer });
    }
  }
  return out;
}

/** Mode to use when re-checking an existing order line. */
export const modeForSharers = (sharerCount: number): SafetyMode => (sharerCount > 1 ? "shared" : "personal");
