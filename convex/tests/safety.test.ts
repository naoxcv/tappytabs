// Owner: Role 3. The safety suite must pass before every demo build.
import { describe, expect, test } from "vitest";
import { addableSet, isSafeFor, levelFor, safeSet, sharedSafeSet } from "../agents/safety";
import { dropBubbleText } from "../agents/bubbles";
import { LEO, MAYA, MENU, PARTY, PRIYA, SAM, VERA } from "./fixtures";

const byName = (name: string) => MENU.find((m) => m.name === name)!;

describe("isSafeFor", () => {
  test("contains → unsafe, with a reason naming the user", () => {
    const s = isSafeFor(byName("Seafood Paella"), [MAYA]);
    expect(s.safe).toBe(false);
    expect(s.reasons[0]).toContain("Maya");
    expect(s.reasons[0]).toContain("shellfish");
  });

  test("may_contain → safe with askServer for a personal line", () => {
    expect(isSafeFor(byName("Tofu Curry"), [LEO], "personal")).toMatchObject({ safe: true, askServer: true });
  });

  test("may_contain → unsafe for a shared line", () => {
    expect(isSafeFor(byName("Tofu Curry"), [LEO, MAYA], "shared").safe).toBe(false);
  });

  test("gluten allergy also checks wheat", () => {
    expect(levelFor(byName("Beef Pho"), "gluten")).toBe("may_contain");
    expect(isSafeFor(byName("Pork Bao"), [SAM]).safe).toBe(false);
  });

  test("diets are positive tags; missing tag fails", () => {
    expect(isSafeFor(byName("Beef Pho"), [PRIYA]).safe).toBe(false);
    expect(isSafeFor(byName("Rice Bowl"), [PRIYA]).safe).toBe(true); // vegan satisfies vegetarian
    expect(isSafeFor(byName("Pesto Pasta"), [VERA]).safe).toBe(false); // vegetarian ≠ vegan
  });

  test("missing allergen rows count as may_contain", () => {
    const s = isSafeFor(byName("Mystery Special"), [MAYA], "personal");
    expect(s).toMatchObject({ safe: true, askServer: true });
  });

  test("drinks go through the same checks", () => {
    expect(isSafeFor(byName("Horchata"), [LEO]).safe).toBe(false);
    expect(isSafeFor(byName("Lassi"), [VERA]).safe).toBe(false);
  });
});

describe("sets", () => {
  test("safeSet never contains an unsafe or untagged item", () => {
    for (const u of [...PARTY, VERA]) {
      for (const i of safeSet(MENU, u)) {
        expect(isSafeFor(i, [u]).safe).toBe(true);
        expect(i.tagStatus).toBe("tagged");
      }
    }
  });

  test("sharedSafeSet is clean (shared mode) for every member and has no drinks", () => {
    const shared = sharedSafeSet(MENU, PARTY);
    expect(shared.map((i) => i.name)).toEqual(["Edamame", "Fries"]);
    for (const i of shared) expect(isSafeFor(i, PARTY, "shared").safe).toBe(true);
  });

  test("addable: personal includes untagged with askServer; shared excludes it", () => {
    const personal = addableSet(MENU, MAYA, PARTY, false);
    expect(personal.find((i) => i.name === "Mystery Special")?.askServer).toBe(true);
    expect(addableSet(MENU, MAYA, PARTY, true).some((i) => i.name === "Mystery Special")).toBe(false);
  });
});

describe("dropBubbleText", () => {
  test("names the real allergen, matches the PRD line", () => {
    const paella = byName("Seafood Paella");
    const failed = PARTY.map((user) => ({ user, safety: isSafeFor(paella, [user], "shared") })).filter((f) => !f.safety.safe);
    expect(dropBubbleText(paella, failed)).toBe("Maya's allergic to shellfish, so no Seafood Paella for the table.");
  });

  test("stays within 120 characters", () => {
    const flat = byName("Flatbread");
    const failed = PARTY.concat(VERA).map((user) => ({ user, safety: isSafeFor(flat, [user], "shared") })).filter((f) => !f.safety.safe);
    expect(dropBubbleText(flat, failed).length).toBeLessThanOrEqual(120);
  });
});
