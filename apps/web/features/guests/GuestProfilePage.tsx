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
import { useBreadcrumbEntityLabels } from "@/components/admin/breadcrumb-entity-labels";
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
import { elCommon, elNav } from "@/lib/i18n";

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
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης επισκέπτη");
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

  useBreadcrumbEntityLabels(
    profileData ? { [guestId]: profileData.guest.displayName } : {},
  );

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
      toastSuccess("Ο επισκέπτης ενημερώθηκε");
      setEditOpen(false);
      await loadProfile();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία ενημέρωσης");
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
      toastSuccess("Η σημείωση προστέθηκε");
      await loadNotes();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία προσθήκης σημείωσης");
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
      toastSuccess("Η ετικέτα αντιστοιχίστηκε");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αντιστοίχισης");
    }
  }

  async function handleUnassignTag(tagId: string) {
    if (!tenantId) return;
    try {
      await unassignGuestTag(tenantId, guestId, tagId);
      await loadProfile();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αφαίρεσης");
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
      toastError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας ετικέτας");
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
        message={error ?? "Ο επισκέπτης δεν βρέθηκε"}
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
        description={
          [guest.email, guest.phone].filter(Boolean).join(" · ") ||
          "Δεν υπάρχουν στοιχεία επικοινωνίας"
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {[guest.country, guest.preferredLanguage].filter(Boolean).join(" · ") || null}
            {isArchived ? (
              <Badge variant="outline" className="text-[10px]">
                Αρχειοθετημένος
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
              <Link href="/dashboard/guests">Πίσω στον κατάλογο</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/bookings/new?guestId=${encodeURIComponent(guestId)}`}>
                Νέα κράτηση
              </Link>
            </Button>
            {canEditGuest ? (
              <Button size="sm" onClick={() => setEditOpen(true)}>
                Επεξεργασία επισκέπτη
              </Button>
            ) : null}
          </div>
        }
      />

      {canManageTags ? (
        <Surface variant="panel" padding="md">
          <SurfaceHeader
            title="Ετικέτες"
            description="Ορισμοί ετικετών οργανισμού και αντιστοιχίσεις."
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label={`Αφαίρεση ετικέτας ${tag.name}`}
                  onClick={() => void handleUnassignTag(tag.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {unassignedTags.length > 0 ? (
              <Select value={assignTagId} onValueChange={(v) => void handleAssignTag(v)}>
                <SelectTrigger className="h-8 w-[160px]" aria-label="Αντιστοίχιση ετικέτας">
                  <SelectValue placeholder="Αντιστοίχιση ετικέτας…" />
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
                placeholder="Νέα ετικέτα"
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
                Δημιουργία & αντιστοίχιση
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="border-b border-border">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
            <TabsTrigger value="overview" className={SECTION_TRIGGER_CLASS}>
              {elNav.overview}
            </TabsTrigger>
            <TabsTrigger value="reservations" className={SECTION_TRIGGER_CLASS}>
              Κρατήσεις
            </TabsTrigger>
            <TabsTrigger value="notes" className={SECTION_TRIGGER_CLASS}>
              {elCommon.notes}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none">
          <Surface variant="panel" padding="md">
            <SurfaceHeader
              title="Μετρήσεις διαμονής"
              description="Υπολογίζονται από κρατήσεις ορατές στο ρόλο σας — όχι λογιστικά σύνολα."
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Σύνολο διαμονών" value={String(metrics.stayCount)} />
              <Metric label={`Πρώτη ${elCommon.checkIn.toLowerCase()}`} value={metrics.firstStayCheckIn ?? "—"} />
              <Metric label={`Τελευταία ${elCommon.checkOut.toLowerCase()}`} value={metrics.lastStayCheckOut ?? "—"} />
              <Metric label={`Επόμενη ${elCommon.checkIn.toLowerCase()}`} value={metrics.nextStayCheckIn ?? "—"} />
              <Metric
                label="Καταλύματα που επισκέφθηκε"
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
                    title="Δεν υπάρχουν κρατήσεις"
                    description="Δεν εμφανίζονται συνδεδεμένες διαμονές στο εύρος σας."
                    action={{
                      label: "Νέα κράτηση",
                      href: `/dashboard/bookings/new?guestId=${encodeURIComponent(guestId)}`,
                    }}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Όνομα επισκέπτη</TableHead>
                      <TableHead>{elCommon.checkIn}</TableHead>
                      <TableHead>{elCommon.checkOut}</TableHead>
                      <TableHead>{elCommon.guests}</TableHead>
                      <TableHead>{elCommon.status}</TableHead>
                      <TableHead className="text-right">{elCommon.open}</TableHead>
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
                              {elCommon.open}
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
            <SurfaceHeader title="Προσθήκη σημείωσης" />
            <div className="mt-3 space-y-2">
              <Textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Γράψτε μια σημείωση για την ομάδα σας…"
                rows={3}
              />
              <Button
                disabled={addingNote || !noteBody.trim()}
                onClick={() => void submitNote()}
              >
                {addingNote ? elCommon.saving : "Προσθήκη σημείωσης"}
              </Button>
            </div>
          </Surface>
          <Surface padding="none">
            {notes.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  title="Δεν υπάρχουν σημειώσεις ακόμα"
                  description="Προσθέστε την πρώτη σημείωση παραπάνω."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notes.map((note) => (
                  <li key={note.id} className="px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                      {note.propertyId ? " · Εύρος καταλύματος" : " · Εύρος οργανισμού"}
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
            <DialogTitle>Επεξεργασία επισκέπτη</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="gp-display">Εμφανιζόμενο όνομα</Label>
              <Input
                id="gp-display"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="gp-first">Όνομα</Label>
                <Input
                  id="gp-first"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gp-last">Επώνυμο</Label>
                <Input
                  id="gp-last"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="gp-email">{elCommon.email}</Label>
              <Input
                id="gp-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gp-phone">{elCommon.phone}</Label>
              <Input
                id="gp-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="gp-country">Χώρα</Label>
                <Input
                  id="gp-country"
                  value={editForm.country}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="gp-lang">Γλώσσα</Label>
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
              {elCommon.cancel}
            </Button>
            <Button disabled={saving || !editForm.displayName.trim()} onClick={() => void saveGuest()}>
              {saving ? elCommon.saving : elCommon.save}
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
