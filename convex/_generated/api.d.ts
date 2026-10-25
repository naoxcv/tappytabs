/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentLogs from "../agentLogs.js";
import type * as agents_bubbles from "../agents/bubbles.js";
import type * as agents_models_bitdeer from "../agents/models/bitdeer.js";
import type * as agents_models_claude from "../agents/models/claude.js";
import type * as agents_models_provider from "../agents/models/provider.js";
import type * as agents_personalities from "../agents/personalities.js";
import type * as agents_profile from "../agents/profile.js";
import type * as agents_prompts_draft from "../agents/prompts/draft.js";
import type * as agents_prompts_followups from "../agents/prompts/followups.js";
import type * as agents_prompts_profileSummary from "../agents/prompts/profileSummary.js";
import type * as agents_prompts_summaryBubble from "../agents/prompts/summaryBubble.js";
import type * as agents_prompts_vote from "../agents/prompts/vote.js";
import type * as agents_ranking from "../agents/ranking.js";
import type * as agents_rules from "../agents/rules.js";
import type * as agents_safety from "../agents/safety.js";
import type * as agents_steps from "../agents/steps.js";
import type * as agents_substitute from "../agents/substitute.js";
import type * as e2e from "../e2e.js";
import type * as lib_guards from "../lib/guards.js";
import type * as menu from "../menu.js";
import type * as messages from "../messages.js";
import type * as negotiation from "../negotiation.js";
import type * as onboarding from "../onboarding.js";
import type * as orders from "../orders.js";
import type * as parties from "../parties.js";
import type * as seed from "../seed.js";
import type * as seedActions from "../seedActions.js";
import type * as seedData from "../seedData.js";
import type * as shared_enums from "../shared/enums.js";
import type * as shared_errors from "../shared/errors.js";
import type * as shared_types from "../shared/types.js";
import type * as tap from "../tap.js";
import type * as tests_fixtures from "../tests/fixtures.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentLogs: typeof agentLogs;
  "agents/bubbles": typeof agents_bubbles;
  "agents/models/bitdeer": typeof agents_models_bitdeer;
  "agents/models/claude": typeof agents_models_claude;
  "agents/models/provider": typeof agents_models_provider;
  "agents/personalities": typeof agents_personalities;
  "agents/profile": typeof agents_profile;
  "agents/prompts/draft": typeof agents_prompts_draft;
  "agents/prompts/followups": typeof agents_prompts_followups;
  "agents/prompts/profileSummary": typeof agents_prompts_profileSummary;
  "agents/prompts/summaryBubble": typeof agents_prompts_summaryBubble;
  "agents/prompts/vote": typeof agents_prompts_vote;
  "agents/ranking": typeof agents_ranking;
  "agents/rules": typeof agents_rules;
  "agents/safety": typeof agents_safety;
  "agents/steps": typeof agents_steps;
  "agents/substitute": typeof agents_substitute;
  e2e: typeof e2e;
  "lib/guards": typeof lib_guards;
  menu: typeof menu;
  messages: typeof messages;
  negotiation: typeof negotiation;
  onboarding: typeof onboarding;
  orders: typeof orders;
  parties: typeof parties;
  seed: typeof seed;
  seedActions: typeof seedActions;
  seedData: typeof seedData;
  "shared/enums": typeof shared_enums;
  "shared/errors": typeof shared_errors;
  "shared/types": typeof shared_types;
  tap: typeof tap;
  "tests/fixtures": typeof tests_fixtures;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
