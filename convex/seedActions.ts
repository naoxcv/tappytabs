// Public seed orchestration: initialize the checked snapshot, then best-effort run the project Actor.
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { RAW_MENU } from "./seedData";

type SeedResult = { restaurantId: Id<"restaurants">; userIds: Id<"users">[]; hostDeviceId: string };
type IngestResult = { count: number; source: "apify" | "seed"; apifyRunId: string | null; note: string };

export const baseAndIngest = action({
  args: {},
  handler: async (ctx): Promise<SeedResult & { menu: IngestResult }> => {
    const seeded: SeedResult = await ctx.runMutation(internal.seed.base, {});
    const menu: IngestResult = await ctx.runAction(api.menu.ingest, { restaurantId: seeded.restaurantId, items: RAW_MENU });
    return { ...seeded, menu };
  },
});
