// Owner: Role 3. Writes a short transcript only after the menu, safety checks, votes, and plan are settled.
import { z } from "zod";
import type { AgentVote, ConversationMessage, UserLite } from "../../shared/types";
import { clipBubbleWords, dropBubbleText } from "../bubbles";
import { COMMON_RULES, tag } from "../models/provider";
import type { MenuItemLite, Plan } from "../../shared/types";
import type { Safety } from "../safety";

const transcriptMessageSchema = z.object({
  kind: z.enum(["proposal", "reaction"]),
  speakerId: z.string().nullable(),
  itemIds: z.array(z.string()),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  oneWord: z.boolean(),
  text: z.string(),
});

export const conversationSchema = z.object({
  messages: z.array(transcriptMessageSchema),
  summary: z.string(),
});

export type TranscriptContext = {
  styleSeed: string;
  restaurant: string;
  users: UserLite[];
  menu: MenuItemLite[];
  drafts: { userId: string; sharedProposals: string[] }[];
  votes: AgentVote[];
  pooled: string[];
  plan: Pick<Plan, "shared" | "mains">;
  drops: { item: MenuItemLite; failed: { user: UserLite; safety: Safety }[] }[];
  topUps: MenuItemLite[];
};

export function conversationPrompt(args: TranscriptContext) {
  const userById = new Map(args.users.map((user) => [user._id, user]));
  const itemById = new Map(args.menu.map((item) => [item._id, item]));
  const proposalIds = new Set([
    ...args.pooled,
    ...args.drops.map((drop) => drop.item._id),
    ...args.topUps.map((item) => item._id),
  ]);
  const proposals = [...proposalIds].flatMap((id) => {
    const item = itemById.get(id);
    if (!item) return [];
    const dropped = args.drops.find((drop) => drop.item._id === id);
    return [{
      id,
      dish: item.name,
      cuisine: item.cuisine,
      description: item.description,
      tags: item.tags,
      selected: args.plan.shared.some((entry) => entry.itemId === id),
      unsafeFor: dropped?.failed.map(({ user }) => user.name) ?? [],
      proposedBy: args.drafts.filter((draft) => draft.sharedProposals.includes(id))
        .map((draft) => ({ id: draft.userId, name: userById.get(draft.userId)?.name ?? "Diner" })),
    }];
  });
  const votes = args.votes.map((vote) => ({
    diner: userById.get(vote.userId)?.name ?? "Diner",
    userId: vote.userId,
    yes: vote.yes.map((id) => itemById.get(id)?.name).filter((name): name is string => !!name),
    no: args.plan.shared.map((entry) => itemById.get(entry.itemId))
      .filter((item): item is MenuItemLite => !!item && !vote.yes.includes(item._id))
      .map((item) => item.name),
  }));
  const system = [
    `You are writing a short, believable group chat for a dinner at ${args.restaurant}.`,
    "The decisions are already final, but write a pretend negotiation that sounds like it happened before the vote. Do not change the actual final plan or votes.",
    "Make this feel like a real group chat with turns: one person suggests a dish, someone reacts, someone may pass or suggest another, then the group settles on the chosen dishes. Do not list all proposals first and all reactions afterward. Aim for 6–8 short messages; safety notes are added separately.",
    "Give each selected dish a proposal and a reply. If the votes show a real difference of opinion, include one other pooled dish and a brief pass or disagreement. Add dialogue turns, not repeated agreement for the same dish.",
    "Use the participants' likes, dislikes, cuisine preferences, and the dish details to give each person a distinct, plausible reason to suggest or react to food. Make preference comments personal and conversational, such as 'I love Japanese food' rather than a description like 'Light and Japanese.' Vary the speakers and avoid repeating the same reaction.",
    "Use only the provided people and dish IDs. Suggest chosen dishes and, at most, one other pooled option that the votes show did not make the plan. Never imply a rejected dish was chosen. If multiple dishes are selected, do not say one is 'instead' of another. Keep each proposal to one dish, with a short question or suggestion.",
    "An unsafe option may come up if it feels like a natural part of this conversation, but do not force one in. If a diner does suggest one, the server will add the exact allergy/diet response immediately after it. Never volunteer restrictions or invent/paraphrase allergy facts yourself.",
    "Write complete, natural chat messages, not adjective fragments or menu descriptions. Reactions must match the speaker's vote for that dish: positive only for yes, negative only for no. Include one or two brief reactions, including a one-word reaction when it fits. Do not stack multiple people saying the same kind of yes to the same dish. A short disagreement or pass is welcome when supported by votes.",
    "Keep proposals to twelve words and reactions to six words. Make the host's final summary twelve words or fewer. Say the shared dishes are chosen, then say 'Pick your main on your phone.' Avoid phrases like 'are in' or 'on the phone.'",
    "Never use em dashes. If a person has two sentences to say, return them as two separate messages. The same person may speak in consecutive messages.",
    "Use the conversation_style_seed only as a variation cue: runs with different seeds should vary wording, reaction choice, and who speaks first where votes allow. Never mention the seed.",
    "Return a single JSON object matching the schema. No prose outside JSON.",
    COMMON_RULES,
  ].join("\n");
  const user = [
    tag("conversation_style_seed", args.styleSeed),
    tag("participants", args.users.map((user) => ({
      id: user._id, name: user.name, personality: user.personality,
      likes: user.likes, dislikes: user.dislikes, cuisines: user.cuisines,
      dislikedCuisines: user.dislikedCuisines,
      allergies: user.allergies, diet: user.diet, spice: user.spice,
    }))),
    tag("proposal_options", proposals),
    tag("final_shared_plan", args.plan.shared.map((entry) => ({
      id: entry.itemId,
      dish: itemById.get(entry.itemId)?.name,
      sharers: entry.sharedBy.map((id) => userById.get(id)?.name ?? "Diner"),
    }))),
    tag("votes", votes),
  ].join("\n");
  return { system, user };
}

export function repairConversation(
  raw: z.infer<typeof conversationSchema>,
  args: TranscriptContext,
  fallbackSummary: string,
): { conversation: ConversationMessage[]; summaryBubble: string } {
  const userById = new Map(args.users.map((user) => [user._id, user]));
  const itemById = new Map(args.menu.map((item) => [item._id, item]));
  const voteById = new Map(args.votes.map((vote) => [vote.userId, vote]));
  const options = new Map<string, { proposerId: string | null; unsafe: boolean; failed: TranscriptContext["drops"][number]["failed"] }>();
  for (const draft of args.drafts) {
    for (const itemId of draft.sharedProposals) {
      const drop = args.drops.find((entry) => entry.item._id === itemId);
      if (itemById.has(itemId) && (args.pooled.includes(itemId) || drop)) {
        options.set(itemId, { proposerId: draft.userId, unsafe: !!drop, failed: drop?.failed ?? [] });
      }
    }
  }
  for (const item of args.topUps) {
    if (args.plan.shared.some((entry) => entry.itemId === item._id)) {
      options.set(item._id, { proposerId: null, unsafe: false, failed: [] });
    }
  }

  const ordered: ConversationMessage[] = [];
  const usedProposalIds = new Set<string>();
  const usedReactionPairs = new Set<string>();
  const positiveReactionItems = new Set<string>();
  let reactionIndex = 0;

  for (const message of raw.messages) {
    if (message.kind === "proposal") {
      const itemIds = [...new Set(message.itemIds)].filter((id) => {
        const option = options.get(id);
        const item = itemById.get(id);
        return !!option && !!item && message.text.toLocaleLowerCase().includes(item.name.toLocaleLowerCase());
      });
      if (itemIds.length === 0) continue;
      let speakerId = message.speakerId && userById.has(message.speakerId) ? message.speakerId : null;
      const firstOption = options.get(itemIds[0]);
      if (firstOption?.proposerId) speakerId = firstOption.proposerId;
      if (!firstOption?.proposerId) speakerId = null;
      const text = clipBubbleWords(message.text, 12, 100);
      if (!text) continue;
      const keptIds = itemIds.filter((id) => text.toLocaleLowerCase().includes(itemById.get(id)!.name.toLocaleLowerCase()));
      if (keptIds.length === 0) continue;
      for (const id of keptIds) usedProposalIds.add(id);
      const proposal: ConversationMessage = { speakerId, kind: "proposal", itemIds: keptIds, text };
      ordered.push(proposal);
      for (const id of keptIds) {
        const option = options.get(id);
        const item = itemById.get(id);
        if (option?.unsafe && item) {
          ordered.push({ speakerId: null, kind: "safety", itemIds: [id], text: dropBubbleText(item, option.failed) });
        }
      }
      continue;
    }

    if (!message.speakerId || !userById.has(message.speakerId)) continue;
    const vote = voteById.get(message.speakerId);
    if (!vote) continue;
    const itemIds = [...new Set(message.itemIds)].filter((id) => {
      if (!args.pooled.includes(id) && !options.get(id)?.unsafe) return false;
      const votedYes = vote.yes.includes(id);
      if (message.sentiment === "positive" && positiveReactionItems.has(id)) return false;
      return message.sentiment === "positive" ? votedYes
        : message.sentiment === "negative" ? !votedYes
          : true;
    });
    if (itemIds.length === 0) continue;
    if (/^[\w'-]+\s+and\s+[\w'-]+[.!?]$/i.test(message.text.trim())) continue;
    const text = message.oneWord || message.text.trim().split(/\s+/).length === 1
      ? oneWordReaction(args.styleSeed, reactionIndex++)
      : clipBubbleWords(message.text, 6, 55);
    if (!text || /works for me/i.test(text)) continue;
    const key = `${message.speakerId}:${itemIds[0]}`;
    if (usedReactionPairs.has(key)) continue;
    usedReactionPairs.add(key);
    if (message.sentiment === "positive") for (const id of itemIds) positiveReactionItems.add(id);
    ordered.push({ speakerId: message.speakerId, kind: "reaction", itemIds, text });
  }

  // Every chosen shared dish gets a proposal line. If the model omitted one, add a concise
  // menu-name question so the following reactions have a clear subject.
  const missing = args.plan.shared.map((entry) => entry.itemId).filter((id) => !usedProposalIds.has(id));
  if (missing.length) {
    const insertion = Math.max(0, ordered.findIndex((message) => message.kind === "reaction"));
    const generated: ConversationMessage[] = [];
    for (const id of missing) {
      const item = itemById.get(id);
      if (!item) continue;
      const proposerId = options.get(id)?.proposerId ?? null;
      generated.push({ speakerId: proposerId, kind: "proposal", itemIds: [id], text: `${item.name}?` });
      usedProposalIds.add(id);
      const yesVote = args.votes.find((vote) => vote.yes.includes(id));
      if (yesVote) {
        generated.push({ speakerId: yesVote.userId, kind: "reaction", itemIds: [id], text: oneWordReaction(args.styleSeed, generated.length) });
      }
    }
    ordered.splice(insertion, 0, ...generated);
  }

  // Ensure at least one short reaction when an actual yes vote supports a selected dish.
  const oneWordCount = ordered.filter((message) => message.kind === "reaction" && message.text.trim().split(/\s+/).length === 1).length;
  if (oneWordCount < 1) {
    for (const entry of args.plan.shared) {
      for (const vote of args.votes.filter((candidate) => candidate.yes.includes(entry.itemId))) {
        const key = `${vote.userId}:${entry.itemId}`;
        if (usedReactionPairs.has(key)) continue;
        ordered.push({
          speakerId: vote.userId,
          kind: "reaction",
          itemIds: [entry.itemId],
          text: oneWordReaction(args.styleSeed, oneWordCount),
        });
        usedReactionPairs.add(key);
        if (ordered.some((message) => message.kind === "reaction" && message.text.trim().split(/\s+/).length === 1)) break;
      }
      if (ordered.some((message) => message.kind === "reaction" && message.text.trim().split(/\s+/).length === 1)) break;
    }
  }

  const conversation = ordered.slice(0, 11).flatMap((message) => {
    const text = message.text.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
    const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
    return sentences.map((sentence) => ({ ...message, text: sentence.trim() })).filter((part) => !!part.text);
  });
  const summaryText = raw.summary.replace(/\s*[—–]\s*/g, ", ");
  const repairedSummary = /\bare in\b|on the phone/i.test(summaryText) ? fallbackSummary : summaryText.trim();
  const summaryBubble = clipBubbleWords(repairedSummary, 12, 100) || fallbackSummary.replace(/[—–]/g, ",");
  return { conversation, summaryBubble };
}

export function fallbackConversation(args: TranscriptContext, fallbackSummary: string) {
  const messages: z.infer<typeof transcriptMessageSchema>[] = [];
  const firstDrop = hashSeed(args.styleSeed) % 3 === 0 ? args.drops[0] : undefined;
  if (firstDrop) {
    const proposerId = args.drafts.find((draft) => draft.sharedProposals.includes(firstDrop.item._id))?.userId ?? null;
    messages.push({
      kind: "proposal", speakerId: proposerId, itemIds: [firstDrop.item._id],
      sentiment: "neutral", oneWord: false, text: `${firstDrop.item.name}?`,
    });
  }
  const reactions = ["Yum!", "Ooh!", "I'm in!", "Nice!"];
  const start = hashSeed(args.styleSeed);
  let reactionIndex = 0;
  for (const entry of args.plan.shared) {
    const item = args.menu.find((candidate) => candidate._id === entry.itemId);
    if (!item) continue;
    const proposerId = args.drafts.find((draft) => draft.sharedProposals.includes(entry.itemId))?.userId ?? null;
    const proposalVariants = [
      `Thoughts on ${item.name}?`,
      `${item.name} to share?`,
      `Should we share ${item.name}?`,
    ];
    messages.push({
      kind: "proposal", speakerId: proposerId, itemIds: [entry.itemId],
      sentiment: "neutral", oneWord: false,
      text: proposalVariants[(start + reactionIndex) % proposalVariants.length],
    });
    const yesVote = args.votes.find((vote) => vote.yes.includes(entry.itemId));
    if (yesVote) {
      const text = reactions[(start + reactionIndex++) % reactions.length];
      messages.push({
        kind: "reaction", speakerId: yesVote.userId, itemIds: [entry.itemId],
        sentiment: "positive", oneWord: text.split(/\s+/).length === 1, text,
      });
    }
  }
  return repairConversation({ messages, summary: "" }, args, fallbackSummary);
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function oneWordReaction(seed: string, index: number): string {
  return ["Yum!", "Ooh!", "Nice!", "Yes!", "Sold!", "Perfect!", "Absolutely!", "Yesss!"][(hashSeed(seed) + index) % 8];
}
