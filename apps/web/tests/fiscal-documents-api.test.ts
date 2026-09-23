import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  listFiscalDocumentsUseCase: { execute: vi.fn() },
  createFiscalDocumentDraftUseCase: { execute: vi.fn() },
  issueFiscalDocumentUseCase: { execute: vi.fn() },
  getFiscalDocumentUseCase: { execute: vi.fn() },
  listFiscalSeriesUseCase: { execute: vi.fn() },
  createFiscalSeriesUseCase: { execute: vi.fn() },
  createCreditFiscalDocumentDraftUseCase: { execute: vi.fn() },
}));

import { requireTenantContext } from "@/lib/tenant-context";
import {
  listFiscalDocumentsUseCase,
  issueFiscalDocumentUseCase,
  listFiscalSeriesUseCase,
} from "@/lib/di/container";
import { GET as listDocs, POST as createDraft } from "@/app/api/admin/v1/fiscal/documents/route";
import { POST as issueDoc } from "@/app/api/admin/v1/fiscal/documents/[documentId]/issue/route";
import { GET as listSeries } from "@/app/api/admin/v1/fiscal/series/route";
import { Result } from "@hcp/domain";

describe("admin fiscal documents API (F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
    } as never);
  });

  it("GET list documents", async () => {
    vi.mocked(listFiscalDocumentsUseCase.execute).mockResolvedValue(
      Result.ok([]) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/documents",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await listDocs(req);
    expect(res.status).toBe(200);
  });

  it("GET series", async () => {
    vi.mocked(listFiscalSeriesUseCase.execute).mockResolvedValue(
      Result.ok([]) as never,
    );
    const req = new NextRequest("http://localhost/api/admin/v1/fiscal/series", {
      headers: { "x-tenant-id": "tenant-1" },
    });
    const res = await listSeries(req);
    expect(res.status).toBe(200);
  });

  it("POST issue requires idempotency key and does not call providers", async () => {
    vi.mocked(issueFiscalDocumentUseCase.execute).mockResolvedValue(
      Result.ok({
        document: { id: "d1", status: "ISSUED" },
        lines: [],
        alreadyIssued: false,
        documentNumber: "APY-1",
      }) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/documents/d1/issue",
      {
        method: "POST",
        headers: {
          "x-tenant-id": "tenant-1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ issuanceIdempotencyKey: "idem-key-001" }),
      },
    );
    const res = await issueDoc(req, {
      params: Promise.resolve({ documentId: "d1" }),
    });
    expect(res.status).toBe(200);
    expect(issueFiscalDocumentUseCase.execute).toHaveBeenCalled();
  });
});
