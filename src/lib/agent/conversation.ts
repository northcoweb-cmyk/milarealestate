import type { ConversationState, Message } from "../types";
import type { Ctx } from "./context";

export async function persistState(ctx: Ctx) {
  await ctx.store.update("conversations", ctx.userId, ctx.conversationId, { state: ctx.state });
}

export async function appendMila(ctx: Ctx, content: string, blocks: Message["blocks"] = []) {
  return ctx.store.insert("messages", ctx.userId, { conversation_id: ctx.conversationId, role: "mila", content, blocks, attachments: [] });
}

export type { ConversationState };
