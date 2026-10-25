/** Small, explainable taste model. Pair answers never imply ingredient avoids. */
export const CONTRASTS = ["texture", "richness", "brightness", "brothiness", "boldness", "char"] as const;
export type Contrast = typeof CONTRASTS[number];
export type PairChoice = "a" | "b" | "both" | "neither";
export type PairAnswer = { pairId: string; choice: PairChoice };
export type TasteCorrection = { contrast: string; value: number | null };
export type TastePreference = { contrast: string; value: number; confidence: number };
export type DishContrast = { contrast: string; value: number; evidence: "stated" | "inferred"; detail: string };

export const PAIRS: readonly { id: string; contrast: Contrast; a: string; b: string }[] = [
  { id: "v2_dumpling_texture", contrast: "texture", a: "Pan-fried pork soup buns", b: "Pork soup dumplings (xiao long bao)" },
  { id: "v2_kokkari_richness", contrast: "richness", a: "Whole grilled fish", b: "Moussaka" },
  { id: "v2_turtle_brightness", contrast: "brightness", a: "Fresh spring rolls", b: "Green papaya salad" },
  { id: "v2_tadich_brothiness", contrast: "brothiness", a: "Pan-fried sand dabs", b: "Cioppino" },
  { id: "v2_burma_boldness", contrast: "boldness", a: "Rainbow salad", b: "Tea leaf salad" },
  { id: "v2_khao_char", contrast: "char", a: "Beef larb (larb nuer)", b: "Pork pad see ew" },
];

/** Negative is the A end of a contrast; positive is B. Core pairs are the first five. */
export function tasteFromAnswers(answers: PairAnswer[], corrections: TasteCorrection[] = []): TastePreference[] {
  const latest = new Map(answers.map((a) => [a.pairId, a.choice]));
  const overrides = new Map(corrections.map((c) => [c.contrast, c.value]));
  return CONTRASTS.flatMap((contrast) => {
    if (overrides.has(contrast)) {
      const value = overrides.get(contrast);
      return value === null ? [] : [{ contrast, value: value!, confidence: 1 }];
    }
    const choices = PAIRS.filter((p) => p.contrast === contrast).map((p) => latest.get(p.id)).filter(Boolean);
    if (!choices.length) return [];
    const directional = choices.filter((c) => c === "a" || c === "b");
    const value = directional.reduce((n, c) => n + (c === "b" ? 1 : -1), 0) / Math.max(1, directional.length);
    return [{ contrast, value, confidence: directional.length ? Math.min(0.8, directional.length * 0.65) : 0.1 }];
  });
}

export function tasteFit(preferences: TastePreference[] = [], dish: DishContrast[] = []): number {
  return preferences.reduce((sum, p) => {
    const trait = dish.find((d) => d.contrast === p.contrast);
    return sum + (trait ? 5 * p.value * trait.value * p.confidence * (trait.evidence === "stated" ? 1 : 0.65) : 0);
  }, 0);
}

export function strongestTaste(preferences: TastePreference[] = []): TastePreference[] {
  return preferences.filter((p) => Math.abs(p.value) >= 0.5 && p.confidence >= 0.5)
    .sort((a, b) => Math.abs(b.value * b.confidence) - Math.abs(a.value * a.confidence)).slice(0, 3);
}
