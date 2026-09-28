"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  createConversation,
  getConversationThread,
  ingestGuestMessage,
  listConversations,
  listOpenEscalations,
  resolveEscalation,
  saveEscalationKnowledge,
  sendOperatorMessage,
} from "@/lib/admin/api";
import type {
  ConversationRecord,
  ConversationThreadRecord,
  OwnerEscalationRecord,
} from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { elCommon, elNav } from "@/lib/i18n";
import { toastError, toastSuccess } from "@/lib/admin/toast";

function statusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Ανοιχτή";
    case "waiting_guest":
      return "Αναμονή επισκέπτη";
    case "waiting_operator":
      return "Αναμονή χειριστή";
    case "resolved":
      return "Ολοκληρωμένη";
    case "archived":
      return "Αρχειοθετημένη";
    default:
      return status;
  }
}

export function MessagesPage() {
  const { tenantId, profile, loading: tenantLoading, error: tenantError } =
    useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const [entireTenant, setEntireTenant] = useState(false);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [escalations, setEscalations] = useState<OwnerEscalationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationThreadRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [demoGuestMsg, setDemoGuestMsg] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalationReplies, setEscalationReplies] = useState<
    Record<string, string>
  >({});
  const [knowledgeDialog, setKnowledgeDialog] = useState<{
    escalationId: string;
    patchText: string;
  } | null>(null);

  const membership = profile?.memberships.find((m) => m.tenantId === tenantId);
  const canEntireTenant =
    membership?.role === "admin" || Boolean(profile?.user.platformRole);

  async function reloadList() {
    if (!tenantId) return;
    if (!entireTenant && !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const [conv, esc] = await Promise.all([
        listConversations(tenantId, {
          propertyId: propertyId ?? undefined,
          entireTenant: entireTenant && canEntireTenant,
        }),
        listOpenEscalations(tenantId, {
          propertyId: propertyId ?? undefined,
          entireTenant: entireTenant && canEntireTenant,
        }),
      ]);
      setConversations(conv.data);
      setEscalations(esc.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης μηνυμάτων",
      );
      setConversations([]);
      setEscalations([]);
    } finally {
      setLoading(false);
    }
  }

  async function reloadThread(conversationId: string) {
    if (!tenantId) return;
    setThreadLoading(true);
    try {
      const next = await getConversationThread(tenantId, conversationId);
      setThread(next);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης συνομιλίας",
      );
      setThread(null);
    } finally {
      setThreadLoading(false);
    }
  }

  useEffect(() => {
    void reloadList();
  }, [tenantId, propertyId, entireTenant, canEntireTenant]);

  useEffect(() => {
    if (selectedId) void reloadThread(selectedId);
    else setThread(null);
  }, [selectedId, tenantId]);

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (!entireTenant && propertyGate) return propertyGate;
  if (tenantLoading || (!entireTenant && !propertyReady)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (tenantError) return <ErrorState message={tenantError} />;
  if (!tenantId) {
    return (
      <ErrorState
        title={elCommon.noTenantContext}
        message="Επιλέξτε οργανισμό για προβολή μηνυμάτων."
      />
    );
  }

  const scopeLabel =
    entireTenant && canEntireTenant
      ? "Όλος ο οργανισμός"
      : property?.name
        ? `Ενεργό κατάλυμα · ${property.name}`
        : elCommon.activeProperty;

  async function handleCreateConversation() {
    if (!tenantId || !propertyId) {
      toastError("Επιλέξτε ενεργό κατάλυμα");
      return;
    }
    setBusy(true);
    try {
      const created = await createConversation(tenantId, {
        propertyId,
        subject: newSubject.trim() || null,
        channel: "talos_direct",
      });
      setNewSubject("");
      toastSuccess("Η συνομιλία δημιουργήθηκε");
      await reloadList();
      setSelectedId(created.id);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας συνομιλίας",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReply() {
    if (!tenantId || !selectedId || !reply.trim()) return;
    setBusy(true);
    try {
      await sendOperatorMessage(tenantId, selectedId, { body: reply.trim() });
      setReply("");
      toastSuccess("Το μήνυμα στάλθηκε");
      await Promise.all([reloadThread(selectedId), reloadList()]);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αποστολής");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateGuest() {
    if (!tenantId || !selectedId || !demoGuestMsg.trim()) return;
    setBusy(true);
    try {
      const result = await ingestGuestMessage(tenantId, selectedId, {
        body: demoGuestMsg.trim(),
      });
      setDemoGuestMsg("");
      toastSuccess(
        result.autoSent
          ? "Αυτόματη απάντηση AI στάλθηκε"
          : result.escalation
            ? "Μήνυμα λήφθηκε · εκκρεμεί escalation"
            : "Μήνυμα επισκέπτη λήφθηκε",
      );
      await Promise.all([reloadThread(selectedId), reloadList()]);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία προσομοίωσης μηνύματος",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveEscalation(
    escalationId: string,
    send: boolean,
  ) {
    if (!tenantId) return;
    const ownerReply = escalationReplies[escalationId]?.trim();
    if (!ownerReply) {
      toastError("Γράψτε απάντηση ιδιοκτήτη");
      return;
    }
    setBusy(true);
    try {
      const result = await resolveEscalation(tenantId, escalationId, {
        ownerReply,
        send,
      });
      toastSuccess(send ? "Απάντηση στάλθηκε" : "Πρόχειρο αποθηκεύτηκε");
      setEscalationReplies((prev) => {
        const next = { ...prev };
        delete next[escalationId];
        return next;
      });
      if (result.saveToKnowledgeOffered) {
        setKnowledgeDialog({
          escalationId,
          patchText: ownerReply,
        });
      }
      await Promise.all([
        reloadList(),
        selectedId ? reloadThread(selectedId) : Promise.resolve(),
      ]);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία επίλυσης escalation",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveKnowledge() {
    if (!tenantId || !knowledgeDialog) return;
    setBusy(true);
    try {
      await saveEscalationKnowledge(tenantId, knowledgeDialog.escalationId, {
        confirm: true,
        patch: {
          amenityNotes: knowledgeDialog.patchText.trim() || null,
        },
      });
      toastSuccess("Αποθηκεύτηκε στη γνώση καταλύματος");
      setKnowledgeDialog(null);
    } catch (err) {
      toastError(
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης γνώσης",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={elNav.messages}
        description="Inbox μηνυμάτων επισκεπτών, απαντήσεις χειριστή και AI receptionist."
        meta={
          <span className="text-xs text-muted-foreground">{scopeLabel}</span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {canEntireTenant ? (
          <Button
            size="sm"
            variant={entireTenant ? "default" : "outline"}
            onClick={() => setEntireTenant((v) => !v)}
          >
            {entireTenant ? "Όλος ο οργανισμός" : "Μόνο ενεργό κατάλυμα"}
          </Button>
        ) : null}
        <Input
          className="max-w-xs"
          placeholder="Θέμα νέας συνομιλίας (προαιρετικό)"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
        />
        <Button
          size="sm"
          disabled={busy || !propertyId}
          onClick={() => void handleCreateConversation()}
        >
          Νέα συνομιλία
        </Button>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void reloadList()} /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Inbox"
              description={`${conversations.length} συνομιλίες`}
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                title="Καμία συνομιλία"
                description="Δημιουργήστε νέα συνομιλία ή περιμένετε μήνυμα επισκέπτη."
              />
            ) : (
              <ul className="divide-y divide-border">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50",
                        selectedId === c.id && "bg-muted",
                      )}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className="truncate text-sm font-medium">
                        {c.subject || "Χωρίς θέμα"}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{statusLabel(c.status)}</Badge>
                        {c.lastMessageAt
                          ? new Date(c.lastMessageAt).toLocaleString("el-GR")
                          : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>

        <Surface variant="panel" padding="md">
          {!selectedId ? (
            <EmptyState
              title="Επιλέξτε συνομιλία"
              description="Δείτε το νήμα, απαντήστε ή προσομοιώστε μήνυμα επισκέπτη."
            />
          ) : threadLoading || !thread ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-4">
              <SurfaceHeader
                title={thread.conversation.subject || "Συνομιλία"}
                description={`Κανάλι · ${thread.conversation.channel}${
                  thread.conversation.bookingId
                    ? ` · Booking ${thread.conversation.bookingId.slice(0, 8)}`
                    : ""
                } · ${statusLabel(thread.conversation.status)}${
                  thread.conversation.routingStatus &&
                  thread.conversation.routingStatus !== "ok"
                    ? ` · routing:${thread.conversation.routingStatus}`
                    : ""
                }`}
              />

              <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded-md border border-border p-3">
                {thread.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Δεν υπάρχουν ακόμα μηνύματα.
                  </p>
                ) : (
                  thread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm",
                        m.direction === "inbound"
                          ? "bg-muted"
                          : "bg-primary/10 ml-4",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {m.senderType === "guest"
                            ? "Επισκέπτης"
                            : m.senderType === "assistant"
                              ? "AI"
                              : "Χειριστής"}
                        </span>
                        <span>
                          {new Date(m.createdAt).toLocaleString("el-GR")}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))
                )}
              </div>

              {thread.suggestions
                .filter((s) => s.status === "ready" || s.status === "pending")
                .slice(0, 1)
                .map((s) => (
                  <div
                    key={s.id}
                    className="rounded-md border border-dashed border-border p-3 text-sm"
                  >
                    <p className="mb-1 font-medium">
                      Πρόταση AI · {s.classification}
                    </p>
                    <p className="mb-2 whitespace-pre-wrap text-muted-foreground">
                      {s.suggestedBody || s.escalationSummary || "—"}
                    </p>
                    {s.suggestedBody ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setReply(s.suggestedBody ?? "");
                        }}
                      >
                        Χρήση πρότασης
                      </Button>
                    ) : null}
                  </div>
                ))}

              <div className="space-y-2">
                <Label>Απάντηση χειριστή</Label>
                <Textarea
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Γράψτε απάντηση…"
                />
                <Button
                  size="sm"
                  disabled={busy || !reply.trim()}
                  onClick={() => void handleSendReply()}
                >
                  Αποστολή
                </Button>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <Label>Προσομοίωση μηνύματος επισκέπτη (demo)</Label>
                <Textarea
                  rows={2}
                  value={demoGuestMsg}
                  onChange={(e) => setDemoGuestMsg(e.target.value)}
                  placeholder="π.χ. Ποιος είναι ο κωδικός Wi‑Fi;"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !demoGuestMsg.trim()}
                  onClick={() => void handleSimulateGuest()}
                >
                  Simulate guest message
                </Button>
              </div>
            </div>
          )}
        </Surface>
      </div>

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Ανοιχτά escalations"
          description="Ερωτήματα που χρειάζονται απάντηση ιδιοκτήτη / χειριστή."
        />
        {escalations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Κανένα ανοιχτό escalation.</p>
        ) : (
          <ul className="space-y-4">
            {escalations.map((e) => (
              <li
                key={e.id}
                className="rounded-md border border-border p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{e.classification}</Badge>
                  <button
                    type="button"
                    className="text-sm text-primary underline-offset-2 hover:underline"
                    onClick={() => setSelectedId(e.conversationId)}
                  >
                    Άνοιγμα συνομιλίας
                  </button>
                </div>
                <p className="text-sm">{e.summaryForOwner}</p>
                {e.reason ? (
                  <p className="text-xs text-muted-foreground">{e.reason}</p>
                ) : null}
                <Textarea
                  rows={2}
                  placeholder="Απάντηση ιδιοκτήτη…"
                  value={escalationReplies[e.id] ?? ""}
                  onChange={(ev) =>
                    setEscalationReplies((prev) => ({
                      ...prev,
                      [e.id]: ev.target.value,
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleResolveEscalation(e.id, true)}
                  >
                    Απάντηση & αποστολή
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleResolveEscalation(e.id, false)}
                  >
                    Μόνο πρόχειρο
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Dialog
        open={Boolean(knowledgeDialog)}
        onOpenChange={(open) => {
          if (!open) setKnowledgeDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποθήκευση στη γνώση (Save-to-Knowledge)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Επιβεβαιώστε το κείμενο που θα αποθηκευτεί ως σημείωση παροχών /
            γνώσης καταλύματος.
          </p>
          <Textarea
            rows={4}
            value={knowledgeDialog?.patchText ?? ""}
            onChange={(e) =>
              setKnowledgeDialog((prev) =>
                prev ? { ...prev, patchText: e.target.value } : prev,
              )
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setKnowledgeDialog(null)}>
              Ακύρωση
            </Button>
            <Button disabled={busy} onClick={() => void handleSaveKnowledge()}>
              Επιβεβαίωση αποθήκευσης
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
