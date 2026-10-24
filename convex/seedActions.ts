// Public seed orchestration: initialize the checked snapshot, then best-effort run the project Actor.
import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { RAW_MENU } from "./seedData";

export const baseAndIngest = action({
  args: {},
  handler: async (ctx) => {
    const seeded = await ctx.runMutation(internal.seed.base, {});
    const menu = await ctx.runAction(api.menu.ingest, { restaurantId: seeded.restaurantId, items: RAW_MENU });
    return { ...seeded, menu };
  },
});
