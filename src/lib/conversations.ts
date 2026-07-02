import * as React from "react";

import {
  campaignsRepo,
  conversationsRepo,
  leadsRepo,
  type Campaign,
  type Conversation,
  type ConversationMessage,
  type Lead,
  type MessageType,
} from "./db";

// All conversation logic lives here: creating conversations from sent emails,
// adding simulated replies, and closing/reopening. The UI only calls the hook.

function makeMessage(
  type: MessageType,
  body: string,
  at: string,
  subject?: string
): ConversationMessage {
  return { id: crypto.randomUUID(), type, subject, body, at };
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

// Called by the QueueController after each successful send.
// Links the sent email to a conversation per (lead, campaign).
export async function recordOutgoingMessage(input: {
  leadId: string;
  campaignId: string;
  subject: string;
  body: string;
}): Promise<void> {
  const all = await conversationsRepo.getAll();
  const existing = all.find(
    (c) => c.leadId === input.leadId && c.campaignId === input.campaignId
  );
  const now = new Date().toISOString();
  const message = makeMessage("outgoing", input.body, now, input.subject);

  if (existing) {
    await conversationsRepo.put({
      ...existing,
      subject: existing.subject || input.subject,
      lastMessage: preview(input.body),
      status: existing.status === "closed" ? "closed" : "waiting",
      messages: [...existing.messages, message],
      updatedAt: now,
    });
  } else {
    await conversationsRepo.put({
      id: crypto.randomUUID(),
      leadId: input.leadId,
      campaignId: input.campaignId,
      subject: input.subject,
      lastMessage: preview(input.body),
      status: "waiting",
      messages: [message],
      createdAt: now,
      updatedAt: now,
    });
  }
}

export type ConversationsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      conversations: Conversation[];
      leads: Map<string, Lead>;
      campaigns: Map<string, Campaign>;
    };

export function useConversations() {
  const [state, setState] = React.useState<ConversationsState>({ status: "loading" });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [conversations, leads, campaigns] = await Promise.all([
        conversationsRepo.getAll(),
        leadsRepo.getAll(),
        campaignsRepo.getAll(),
      ]);
      setState({
        status: "ready",
        conversations,
        leads: new Map(leads.map((l) => [l.id, l])),
        campaigns: new Map(campaigns.map((c) => [c.id, c])),
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not read the local database.",
      });
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const replace = (updated: Conversation) =>
    setState((prev) =>
      prev.status === "ready"
        ? {
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === updated.id ? updated : c
            ),
          }
        : prev
    );

  const addReply = async (
    conversation: Conversation,
    body: string,
    at: string
  ): Promise<Conversation> => {
    const updated: Conversation = {
      ...conversation,
      status: "replied",
      lastMessage: preview(body),
      messages: [...conversation.messages, makeMessage("incoming", body, at)],
      updatedAt: new Date().toISOString(),
    };
    await conversationsRepo.put(updated);
    replace(updated);
    return updated;
  };

  const close = async (conversation: Conversation): Promise<Conversation> => {
    const now = new Date().toISOString();
    const updated: Conversation = {
      ...conversation,
      status: "closed",
      messages: [
        ...conversation.messages,
        makeMessage("system", "Conversation closed", now),
      ],
      updatedAt: now,
    };
    await conversationsRepo.put(updated);
    replace(updated);
    return updated;
  };

  const reopen = async (conversation: Conversation): Promise<Conversation> => {
    const now = new Date().toISOString();
    const updated: Conversation = {
      ...conversation,
      status: conversation.messages.some((m) => m.type === "incoming")
        ? "replied"
        : "waiting",
      messages: [
        ...conversation.messages,
        makeMessage("system", "Conversation reopened", now),
      ],
      updatedAt: now,
    };
    await conversationsRepo.put(updated);
    replace(updated);
    return updated;
  };

  return { state, load, addReply, close, reopen };
}
