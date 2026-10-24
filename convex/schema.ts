// CONTRACT (milestone 1). Owner: Role 4. Every table the app uses.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  allergenV, dietV, hungerV, joinViaV, levelV, personalityV, statusV, tagStatusV,
} from "./shared/enums";

export default defineSchema({
  // One row per device profile. No login (PRD non-goal): the iOS app generates a deviceId once.
  users: defineTable({
    deviceId: v.string(),
    name: v.string(),
    allergies: v.array(allergenV),
    diet: v.array(dietV),
    spice: v.number(), // 0–4 tolerance
    likes: v.array(v.string()), // tags
    dislikes: v.array(v.string()), // tags
    cuisines: v.array(v.string()),
    dislikedCuisines: v.optional(v.array(v.string())),
    likedCategories: v.optional(v.array(v.string())),
    personality: v.optional(personalityV),
    avatarId: v.string(),
    profileSummary: v.optional(v.string()),
  }).index("by_device", ["deviceId"]),

  restaurants: defineTable({
    name: v.string(),
    mapsUrl: v.optional(v.string()),
    menuSource: v.union(v.literal("seed"), v.literal("apify")),
    apifyRunId: v.optional(v.string()),
    fetchedAt: v.optional(v.number()),
  }),

  menuItems: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    category: v.string(), // "mains" | "sides" | "drinks" | "desserts" | ... (free text from the menu)
    cuisine: v.optional(v.string()),
    tags: v.array(v.string()),
    description: v.string(),
    priceCents: v.number(),
    allergens: v.array(v.object({ allergen: allergenV, level: levelV })), // one entry per ALLERGEN
    diet: v.array(dietV), // positive tags only; a missing tag fails that diet
    spice: v.number(), // 0–4
    isDrink: v.boolean(),
    shareable: v.boolean(),
    menuOrder: v.number(),
    tagStatus: tagStatusV,
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_name", ["restaurantId", "name"]),

  parties: defineTable({
    restaurantId: v.id("restaurants"),
    hostDeviceId: v.string(),
    size: v.number(),
    status: statusV,
    joinCode: v.string(),
    epoch: v.number(), // bumped by reset; scheduled jobs carry it and exit if it changed
    negotiationStartedAt: v.optional(v.number()),
    committedAt: v.optional(v.number()),
    pickDeadline: v.optional(v.number()),
    confirmDeadline: v.optional(v.number()),
    placedAt: v.optional(v.number()),
  }).index("by_joinCode", ["joinCode"]),

  members: defineTable({
    partyId: v.id("parties"),
    userId: v.id("users"),
    joinedVia: joinViaV,
    joinedAt: v.number(),
    hunger: v.optional(hungerV),
    pickedItemId: v.optional(v.id("menuItems")),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_party", ["partyId"])
    .index("by_party_user", ["partyId", "userId"]),

  // Written by negotiation.commit: each diner's 3 mains + 1 drink.
  candidates: defineTable({
    partyId: v.id("parties"),
    userId: v.id("users"),
    itemId: v.id("menuItems"),
    rank: v.number(), // 1 = agent's top pick; drinks use rank 0
    reason: v.string(),
    isDrink: v.boolean(),
    askServer: v.boolean(),
  }).index("by_party_user", ["partyId", "userId"]),

  // Speech bubbles. fromUserId absent = the restaurant agent. Clients reveal each at showAt.
  messages: defineTable({
    partyId: v.id("parties"),
    fromUserId: v.optional(v.id("users")),
    text: v.string(),
    showAt: v.number(),
  }).index("by_party_showAt", ["partyId", "showAt"]),

  orderLines: defineTable({
    partyId: v.id("parties"),
    itemId: v.id("menuItems"),
    qty: v.number(),
    kind: v.union(v.literal("main"), v.literal("drink"), v.literal("shared"), v.literal("extra")),
    sharedBy: v.array(v.id("users")), // "shared" when length > 1
    addedBy: v.union(v.id("users"), v.literal("agent")),
  }).index("by_party", ["partyId"]),

  // Every model call: evidence for the Anthropic and Bitdeer tracks, and our debug log.
  agentLogs: defineTable({
    partyId: v.optional(v.id("parties")),
    userId: v.optional(v.id("users")),
    prompt: v.string(),
    provider: v.string(),
    model: v.string(),
    latencyMs: v.number(),
    fallback: v.boolean(),
    error: v.optional(v.string()),
  }),
});
