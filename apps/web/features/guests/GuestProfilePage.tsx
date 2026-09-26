"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import {
  addGuestNote,
  assignGuestTag,
  createGuestTag,
  getGuestProfile,
  listGuestNotes,
  listGuestReservations,
  listGuestTags,
  unassignGuestTag,
  updateGuest,
} from "@/lib/admin/api";
import type {
  GuestNoteRecord,
  GuestProfileRecord,
  GuestReservationRecord,
  GuestTagRecord,
} from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SECTION_TRIGGER_CLASS =
  "rounded-md px-3 py-1.5 text-xs data-[state=active]:bg-primary-subtle data-[state=active]:text-primary data-[state=active]:shadow-none";

interface GuestProfilePageProps {
  guestId: string;
}

export function GuestProfilePage({ guestId }: GuestProfilePageProps) {
  const { tenantId, profile, loading: tenantLoading, error: tenantError } = useTenant();
  const { propertyId } = useActiveProperty();
  const [profileData, setProfileData] = useState<GuestProfileRecord | null>(null);
  const [notes, setNotes] = useState<GuestNoteRecord[]>([]);
  const [reservations, setReservations] = useState<GuestReservationRecord[]>([]);
  const [allTags, setAllTags] = useState<GuestTagRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [assignTagId, setAssignTagId] = useState("");
  const [editForm, setEditForm] = useState({
    displayName: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
    preferredLanguage: "",
  });

  const membership = profile?.memberships.find((m) => m.tenantId === tenantId);
  const canManageTags =
    membership?.role === "admin" || Boolean(profile?.user.platformRole);
  const canEditGuest =
    membership?.role === "admin" || Boolean(profile?.user.platformRole);

  const loadProfile = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getGuestProfile(tenantId, guestId);
      setProfileData(data);
      setEditForm({
        displayName: data.guest.displayName,
        firstName: data.guest.firstName ?? "",
        lastName: data.guest.lastName ?? "",
        email: data.guest.email ?? "",
        phone: data.guest.phone ?? "",
        country: data.guest.country ?? "",
        preferredLanguage: data.guest.preferredLanguage ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load guest");
      setProfileData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, guestId]);

  const loadNotes = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await listGuestNotes(tenantId, guestId);
      setNotes(res.data ?? []);
    } catch {
      setNotes([]);
    }
  }, [tenantId, guestId]);

  const loadReservations = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await listGuestReservations(tenantId, guestId, { page: 1, limit: 50 });
      setReservations(res.data ?? []);
    } catch {
      setReservations([]);
    }
  }, [tenantId, guestId]);

  const loadTagsCatalog = useCallback(async () => {
    if (!tenantId || !canManageTags) return;
    try {
      const res = await listGuestTags(tenantId);
      setAllTags((res.data ?? []).filter((t) => !t.archivedAt));
    } catch {
      setAllTags([]);
    }
  }, [tenantId, canManageTags]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (tab === "notes") void loadNotes();
    if (tab === "reservations") void loadReservations();
  }, [tab, loadNotes, loadReservations]);

  useEffect(() => {
    void loadTagsCatalog();
  }, [loadTagsCatalog]);

  const unassignedTags = useMemo(() => {
    if (!profileData) return [];
    const assigned = new Set(profileData.tags.map((t) => t.id));
    return allTags.filter((t) => !assigned.has(t.id));
  }, [allTags, profileData]);

  async function saveGuest() {
    if (!tenantId || !canEditGuest) return;
    setSaving(true);
    try {
      await updateGuest(tenantId, guestId, {
        displayName: editForm.displayName.trim(),
        firstName: editForm.firstName.trim() || null,
        lastName: editForm.lastName.trim() || null,
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
        country: editForm.country.trim() || null,
        preferredLanguage: editForm.preferredLanguage.trim() || null,
      });
      toastSuccess("Guest updated");
      setEditOpen(false);
      await loadProfile();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitNote() {
    if (!tenantId || !noteBody.trim()) return;
    setAddingNote(true);
    try {
      await addGuestNote(tenantId, guestId, {
        body: noteBody.trim(),
        propertyId: propertyId ?? null,
      });
      setNoteBody("");
      toastSuccess("Note added");
      await loadNotes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not add note");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleAssignTag(tagId: string) {
    if (!tenantId || !tagId) return;
    try {
      await assignGuestTag(tenantId, guestId, tagId);
      setAssignTagId("");
      await loadProfile();
      toastSuccess("Tag assigned");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Assign failed");
    }
  }

  async function handleUnassignTag(tagId: string) {
    if (!tenantId) return;
    try {
      await unassignGuestTag(tenantId, guestId, tagId);
      await loadProfile();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function handleCreateTag() {
    if (!tenantId || !newTagName.trim()) return;
    try {
      const tag = await createGuestTag(tenantId, newTagName.trim());
      setNewTagName("");
      await loadTagsCatalog();
      await handleAssignTag(tag.id);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Create tag failed");
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !profileData) {
    return (
      <ErrorState
        message={error ?? "Guest not found"}
        onRetry={() => void loadProfile()}
      />
    );
  }

  const { guest, metrics, tags } = profileData;
  const isArchived = Boolean(guest.archivedAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title={guest.displayName}
        description={[guest.email, guest.phone].filter(Boolean).join(" · ") || "No contact on file"}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {[guest.country, guest.preferredLanguage].filter(Boolean).join(" · ") || null}
            {isArchived ? (
              <Badge variant="outline" className="text-[10px]">
                Archived
              </Badge>
            ) : null}
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="text-[10px]">
                {tag.name}
              </Badge>
            ))}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/guests">Back to directory</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/bookings/new?guestId=${encodeURIComponent(guestId)}`}>
                New reservation
              </Link>
            </Button>
            {canEditGuest ? (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                Edit guest
              </Button>
            ) : null}
          </div>
        }
      />

      {canManageTags ? (
        <Surface variant="panel" padding="md">
          <SurfaceHeader title="Tags" description="Tenant tag definitions and assignments." />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label={`Remove tag ${tag.name}`}
                  onClick={() => void handleUnassignTag(tag.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {unassignedTags.length > 0 ? (
              <Select value={assignTagId} onValueChange={(v) => void handleAssignTag(v)}>
                <SelectTrigger className="h-8 w-[160px]" aria-label="Assign tag">
                  <SelectValue placeholder="Assign tag…" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTags.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <div className="flex gap-2">
              <Input
                className="h-8 w-[140px]"
                placeholder="New tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!newTagName.trim()}
                onClick={() => void handleCreateTag()}
              >
                Create & assign
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="border-b border-border">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
            <TabsTrigger value="overview" className={SECTION_TRIGGER_CLASS}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="reservations" className={SECTION_TRIGGER_CLASS}>
              Reservations
            </TabsTrigger>
            <TabsTrigger value="notes" className={SECTION_TRIGGER_CLASS}>
              Notes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Stay metrics"
              description="Computed from reservations visible to your role — not billing totals."
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Total stays" value={String(metrics.stayCount)} />
              <Metric label="First stay check-in" value={metrics.firstStayCheckIn ?? "—"} />
              <Metric label="Last stay check-out" value={metrics.lastStayCheckOut ?? "—"} />
              <Metric label="Next stay check-in" value={metrics.nextStayCheckIn ?? "—"} />
              <Metric
                label="Properties visited"
                value={String(metrics.propertyIdsVisited.length)}
              />
            </dl>
          </Surface>
        </TabsContent>

        <TabsContent value="reservations" className="mt-0 focus-visible:outline-none">
          <div className="overflow-x-auto">
            <Surface padding="none">
              {reservations.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    compact
                    title="No reservations"
                    description="No linked stays are visible in your scope."
                    action={{
                      label: "New reservation",
                      href: `/dashboard/bookings/new?guestId=${encodeURIComponent(guestId)}`,
                    }}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest name</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Guests</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservations.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.guestName}</TableCell>
                        <TableCell className="tabular-nums text-sm">{row.checkIn}</TableCell>
                        <TableCell className="tabular-nums text-sm">{row.checkOut}</TableCell>
                        <TableCell>{row.guestCount}</TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/dashboard/bookings?bookingId=${encodeURIComponent(row.id)}`}
                            >
                              Open
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Surface>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-0 space-y-4 focus-visible:outline-none">
          <Surface variant="panel" padding="md">
            <SurfaceHeader title="Add note" />
            <div className="mt-3 space-y-2">
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write a note for your team…"
                rows={3}
              />
              <Button
                disabled={addingNote || !noteBody.trim()}
                onClick={() => void submitNote()}
              >
                {addingNote ? "Saving…" : "Add note"}
              </Button>
            </div>
          </Surface>
          <Surface padding="none">
            {notes.length === 0 ? (
              <div className="p-4">
                <EmptyState compact title="No notes yet" description="Add the first note above." />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                      {note.propertyId ? " · Property-scoped" : " · Tenant-wide"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit guest</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="gp-display">Display name</Label>
              <Input
                id="gp-display"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="gp-first">First name</Label>
                <Input
                  id="gp-first"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gp-last">Last name</Label>
                <Input
                  id="gp-last"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gp-email">Email</Label>
              <Input
                id="gp-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gp-phone">Phone</Label>
              <Input
                id="gp-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="gp-country">Country</Label>
                <Input
                  id="gp-country"
                  value={editForm.country}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gp-lang">Language</Label>
                <Input
                  id="gp-lang"
                  value={editForm.preferredLanguage}
                  onChange={(e) =>
                    setEditForm({ ...editForm, preferredLanguage: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving || !editForm.displayName.trim()} onClick={() => void saveGuest()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
