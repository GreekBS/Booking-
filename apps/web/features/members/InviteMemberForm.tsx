"use client";

import { useEffect, useState } from "react";

export function InviteMemberForm() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager">("manager");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/v1/me")
      .then((r) => r.json())
      .then((data) => {
        setTenantId(
          data.user?.activeTenantId ?? data.memberships?.[0]?.tenantId ?? null,
        );
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;

    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/admin/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
      },
      body: JSON.stringify({ email, role }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setMessage(data.error?.message ?? "Failed to send invite");
      return;
    }

    setMessage("Invitation sent (check server console for token stub)");
    setEmail("");
  }

  if (!tenantId) return null;

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4 space-y-4">
      <h2 className="font-medium">Invite member</h2>
      {message && (
        <p className="rounded bg-green-50 p-2 text-sm text-green-700">{message}</p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "manager")}
          className="w-full rounded border px-3 py-2"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send invite"}
      </button>
    </form>
  );
}
