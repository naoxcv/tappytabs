// Public seed orchestration: initialize the checked snapshot, then best-effort run the project Actor.
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { RAW_MENU } from "./seedData";

type BaseSeed = { restaurantId: Id<"restaurants">; userIds: Id<"users">[]; hostDeviceId: string };
type MenuIngestResult = { count: number; source: "apify" | "seed"; apifyRunId: string | null; note: string };
type BaseAndIngestResult = BaseSeed & { menu: MenuIngestResult };

export const baseAndIngest = action({
  args: {},
  handler: async (ctx): Promise<BaseAndIngestResult> => {
    const seeded: BaseSeed = await ctx.runMutation(internal.seed.base, {});
    const menu: MenuIngestResult = await ctx.runAction(api.menu.ingest, { restaurantId: seeded.restaurantId, items: RAW_MENU });
    return { ...seeded, menu };
  },
});
