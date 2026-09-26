"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { adminFetch, fetchPropertyUnitCatalog } from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { MemberRecord, PendingInvitationRecord, CatalogPropertyRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function formatRole(role: string): string {
  if (!role) return "—";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export function MembersPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitationRecord[]>([]);
  const [properties, setProperties] = useState<CatalogPropertyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<MemberRecord | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<MemberRecord | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "manager", propertyIds: [] as string[] });
  const [editForm, setEditForm] = useState({ role: "manager", propertyIds: [] as string[] });
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, catalog] = await Promise.all([
        adminFetch<{
          data: MemberRecord[];
          pendingInvitations: PendingInvitationRecord[];
        }>("/members", { tenantId }),
        fetchPropertyUnitCatalog(tenantId),
      ]);
      setMembers(membersRes.data ?? []);
      setPendingInvitations(membersRes.pendingInvitations ?? []);
      setProperties(catalog.properties);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function invite() {
    if (!tenantId) return;
    setActionLoading(true);
    try {
      await adminFetch("/members", {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          email: inviteForm.email,
          role: inviteForm.role,
          propertyIds: inviteForm.role === "manager" ? inviteForm.propertyIds : undefined,
        }),
      });
      setInviteOpen(false);
      setInviteForm({ email: "", role: "manager", propertyIds: [] });
      toastSuccess("Invitation sent");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveMember() {
    if (!tenantId || !editMember) return;
    setActionLoading(true);
    try {
      await adminFetch(`/members/${editMember.id}`, {
        method: "PATCH",
        tenantId,
        body: JSON.stringify({
          role: editForm.role,
          propertyIds: editForm.role === "manager" ? editForm.propertyIds : null,
        }),
      });
      setEditMember(null);
      toastSuccess("Member updated");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function resendInvite(invitationId: string) {
    if (!tenantId) return;
    setActionLoading(true);
    try {
      await adminFetch(`/invitations/${invitationId}/resend`, {
        method: "POST",
        tenantId,
      });
      toastSuccess("Invitation resent");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function revoke() {
    if (!tenantId || !revokeTarget) return;
    setActionLoading(true);
    try {
      await adminFetch(`/members/${revokeTarget.id}`, { method: "DELETE", tenantId });
      toastSuccess("Member revoked");
      setRevokeTarget(null);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setActionLoading(false);
    }
  }

  function propertyLabel(ids: string[] | null) {
    if (!ids || ids.length === 0) return "All properties";
    return ids
      .map((id) => properties.find((p) => p.id === id)?.name ?? id.slice(0, 6))
      .join(", ");
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        description="Tenant-wide team access, roles, and property scoping for managers"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite member
          </Button>
        }
      />

      {members.length === 0 ? (
        <EmptyState
          title="No team members"
          description="Invite colleagues to help manage your properties."
          action={{ label: "Invite member", onClick: () => setInviteOpen(true) }}
        />
      ) : (
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Team members"
              description={`${members.length} member${members.length === 1 ? "" : "s"} with access to this tenant`}
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.user?.name ?? "—"}</TableCell>
                    <TableCell>{member.user?.email ?? "—"}</TableCell>
                    <TableCell>{formatRole(member.role)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {member.role === "manager" ? propertyLabel(member.propertyIds) : "All"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={member.status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditMember(member);
                              setEditForm({
                                role: member.role,
                                propertyIds: member.propertyIds ?? [],
                              });
                            }}
                          >
                            Edit role & properties
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled
                            title="Resend is only for pending invitations"
                          >
                            Resend invite
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRevokeTarget(member)}>
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      )}

      {pendingInvitations.length > 0 ? (
        <Surface variant="panel" padding="none">
          <div className="border-b border-border px-4 py-3">
            <SurfaceHeader
              className="mb-0"
              title="Pending invitations"
              description="Invites that have not been accepted yet"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{formatRole(invitation.role)}</TableCell>
                    <TableCell>{new Date(invitation.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionLoading}
                        onClick={() => void resendInvite(invitation.id)}
                      >
                        Resend
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Surface>
      ) : null}

      <MemberFormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite member"
        email={inviteForm.email}
        role={inviteForm.role}
        propertyIds={inviteForm.propertyIds}
        properties={properties}
        loading={actionLoading}
        onEmailChange={(email) => setInviteForm({ ...inviteForm, email })}
        onRoleChange={(role) => setInviteForm({ ...inviteForm, role, propertyIds: [] })}
        onPropertyToggle={(id, checked) =>
          setInviteForm({
            ...inviteForm,
            propertyIds: checked
              ? [...inviteForm.propertyIds, id]
              : inviteForm.propertyIds.filter((p) => p !== id),
          })
        }
        onSubmit={() => void invite()}
      />

      <MemberFormDialog
        open={Boolean(editMember)}
        onOpenChange={(open) => !open && setEditMember(null)}
        title="Edit member"
        role={editForm.role}
        propertyIds={editForm.propertyIds}
        properties={properties}
        loading={actionLoading}
        onRoleChange={(role) =>
          setEditForm({
            ...editForm,
            role,
            propertyIds: role === "admin" ? [] : editForm.propertyIds,
          })
        }
        onPropertyToggle={(id, checked) =>
          setEditForm({
            ...editForm,
            propertyIds: checked
              ? [...editForm.propertyIds, id]
              : editForm.propertyIds.filter((p) => p !== id),
          })
        }
        onSubmit={() => void saveMember()}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke member"
        description={`Remove access for ${revokeTarget?.user?.email ?? "this member"}?`}
        confirmLabel="Revoke"
        destructive
        loading={actionLoading}
        onConfirm={revoke}
      />
    </div>
  );
}

function MemberFormDialog({
  open,
  onOpenChange,
  title,
  email,
  role,
  propertyIds,
  properties,
  loading,
  onEmailChange,
  onRoleChange,
  onPropertyToggle,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  email?: string;
  role: string;
  propertyIds: string[];
  properties: CatalogPropertyRecord[];
  loading: boolean;
  onEmailChange?: (email: string) => void;
  onRoleChange: (role: string) => void;
  onPropertyToggle: (id: string, checked: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {onEmailChange ? (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email ?? ""}
                onChange={(e) => onEmailChange(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={onRoleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role === "manager" ? (
            <div className="space-y-2">
              <Label>Assigned properties</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {properties.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={propertyIds.includes(p.id)}
                      onChange={(e) => onPropertyToggle(p.id, e.target.checked)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={loading} onClick={onSubmit}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
