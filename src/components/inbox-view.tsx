"use client";

import * as React from "react";
import { AlertTriangle, Inbox, MessageSquarePlus, Search } from "lucide-react";

import type { Conversation, ConversationStatus } from "@/lib/db";
import { useConversations } from "@/lib/conversations";
import { nameOf } from "@/lib/use-leads-filter";
import { cn, INPUT_CLASS } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";

const STATUS_STYLES: Record<ConversationStatus, string> = {
  waiting: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  replied: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  closed: "text-muted-foreground",
};

const STATUS_LABELS: Record<ConversationStatus, string> = {
  waiting: "Waiting",
  replied: "Replied",
  closed: "Closed",
};

function localDateTimeNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function InboxView() {
  const { state, load, addReply, close, reopen } = useConversations();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [replyBody, setReplyBody] = React.useState("");
  const [replyAt, setReplyAt] = React.useState(localDateTimeNow());

  const conversations = React.useMemo(
    () =>
      state.status === "ready"
        ? [...state.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        : [],
    [state]
  );

  // Auto-select the newest conversation once loaded.
  React.useEffect(() => {
    if (state.status === "ready" && selected === null && conversations.length > 0) {
      setSelected(conversations[0].id);
    }
  }, [state.status, conversations, selected]);

  if (state.status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md pt-12">
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the inbox"
          description={state.message}
          action={<Button onClick={load}>Retry</Button>}
        />
      </div>
    );
  }

  const { leads, campaigns } = state;

  const leadName = (conversation: Conversation) => {
    const lead = leads.get(conversation.leadId);
    return lead ? nameOf(lead) || lead.email : "Unknown lead";
  };

  const listed = (() => {
    const query = q.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((c) => {
      const lead = leads.get(c.leadId);
      return (
        c.subject.toLowerCase().includes(query) ||
        leadName(c).toLowerCase().includes(query) ||
        (lead?.company ?? "").toLowerCase().includes(query)
      );
    });
  })();

  const current = conversations.find((c) => c.id === selected) ?? null;
  const currentLead = current ? leads.get(current.leadId) : undefined;

  const openReply = () => {
    setReplyBody("");
    setReplyAt(localDateTimeNow());
    setReplyOpen(true);
  };

  const saveReply = async () => {
    if (!current || !replyBody.trim()) return;
    const at = replyAt ? new Date(replyAt).toISOString() : new Date().toISOString();
    await addReply(current, replyBody.trim(), at);
    setReplyOpen(false);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inbox"
        description="Conversations linked to sent emails. Not an email client."
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Inbox is empty"
          description="A conversation is created for every email the queue sends."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <div className="relative mb-3">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search conversations…"
                aria-label="Search conversations"
                className={cn(INPUT_CLASS, "h-9 pl-8")}
              />
            </div>
            <Card>
              {listed.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No conversations match.</p>
              ) : (
                <ul className="divide-y">
                  {listed.map((conversation) => {
                    const lead = leads.get(conversation.leadId);
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(conversation.id)}
                          className={cn(
                            "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            selected === conversation.id && "bg-accent"
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {leadName(conversation)}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-md border px-1.5 py-0 text-[10px]",
                                STATUS_STYLES[conversation.status]
                              )}
                            >
                              {STATUS_LABELS[conversation.status]}
                            </span>
                          </span>
                          {lead?.company && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {lead.company}
                            </span>
                          )}
                          <span className="block truncate text-xs text-muted-foreground">
                            {conversation.subject}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(conversation.updatedAt).toLocaleString()}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {current ? (
            <div className="min-w-0 space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">{current.subject}</h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {[
                          leadName(current),
                          currentLead?.company,
                          currentLead?.email,
                          campaigns.get(current.campaignId)?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={openReply}>
                        <MessageSquarePlus aria-hidden="true" />
                        Add Reply
                      </Button>
                      {current.status === "closed" ? (
                        <Button variant="outline" size="sm" onClick={() => reopen(current)}>
                          Reopen
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => close(current)}>
                          Close Conversation
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {current.messages.map((message) => {
                  if (message.type === "system") {
                    return (
                      <p
                        key={message.id}
                        className="text-center text-xs text-muted-foreground"
                      >
                        {message.body} · {new Date(message.at).toLocaleString()}
                      </p>
                    );
                  }
                  const outgoing = message.type === "outgoing";
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", outgoing ? "justify-end" : "justify-start")}
                    >
                      <Card
                        className={cn(
                          "max-w-[85%] p-3",
                          outgoing ? "bg-muted/50" : "border-emerald-500/40"
                        )}
                      >
                        <p className="mb-1 text-xs text-muted-foreground">
                          {outgoing ? "Sent" : "Reply"} ·{" "}
                          {new Date(message.at).toLocaleString()}
                        </p>
                        {message.subject && (
                          <p className="text-sm font-medium">{message.subject}</p>
                        )}
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-sm">
                          {message.body}
                        </pre>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Inbox}
              title="Select a conversation"
              description="Choose a conversation from the list."
            />
          )}
        </div>
      )}

      {replyOpen && current && (
        <AlertDialog open onOpenChange={(open) => !open && setReplyOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add Reply</AlertDialogTitle>
              <AlertDialogDescription>
                Simulates receiving an email from {leadName(current)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="reply-body"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  Message
                </label>
                <textarea
                  id="reply-body"
                  rows={5}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className={cn(INPUT_CLASS, "py-2 font-mono")}
                />
              </div>
              <div>
                <label
                  htmlFor="reply-at"
                  className="mb-1 block text-xs text-muted-foreground"
                >
                  Timestamp
                </label>
                <input
                  id="reply-at"
                  type="datetime-local"
                  value={replyAt}
                  onChange={(e) => setReplyAt(e.target.value)}
                  className={cn(INPUT_CLASS, "h-9")}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setReplyOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!replyBody.trim()} onClick={saveReply}>
                Save Reply
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
