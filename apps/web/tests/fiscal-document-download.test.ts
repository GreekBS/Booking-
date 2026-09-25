import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Result, ForbiddenError, NotFoundError, ValidationError } from "@hcp/domain";

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: vi.fn(),
  toPermissionActor: vi.fn((actor: unknown) => actor),
}));

vi.mock("@/lib/di/container", () => ({
  getFiscalDocumentUseCase: { execute: vi.fn() },
}));

vi.mock("@/lib/fiscal/fiscal-document-render", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/fiscal/fiscal-document-render")
  >("@/lib/fiscal/fiscal-document-render");
  return {
    ...actual,
    renderFiscalDocumentPdf: vi.fn(async () => Buffer.from("%PDF-1.4 mock")),
  };
});

import { requireTenantContext } from "@/lib/tenant-context";
import { getFiscalDocumentUseCase } from "@/lib/di/container";
import { GET as download } from "@/app/api/admin/v1/fiscal/documents/[documentId]/download/route";

const issuedPayload = {
  documentNumber: "A-123",
  localStatusLabel: "Issued locally",
  greekMapping: { myDataInvoiceType: "2.1", labelEn: "Invoice" },
  document: {
    id: "11111111-1111-4111-8111-111111111111",
    documentKind: "SERVICE_INVOICE",
    status: "ISSUED",
    seriesCode: "A",
    sequenceNumber: 123,
    issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    currency: "EUR",
    propertyId: "prop-a",
    issuerSnapshot: {
      legalName: "Hotel SA",
      tradeName: null,
      vatNumber: "123456789",
      address: {
        line1: "1 Street",
        line2: null,
        city: "Athens",
        region: null,
        postalCode: "10431",
        country: "GR",
      },
    },
    customerSnapshot: {
      legalName: "Acme OE",
      type: "BUSINESS",
      vatNumber: "987654321",
      country: "GR",
      email: null,
      address: {
        line1: "2 Ave",
        line2: null,
        city: "Athens",
        region: null,
        postalCode: "10432",
        country: "GR",
      },
    },
    totals: {
      netTotal: "100.0000",
      vatTotal: "24.0000",
      levyTotal: "0.0000",
      grossTotal: "124.0000",
    },
  },
  lines: [
    {
      description: "Stay",
      netAmount: "100.0000",
      vatAmount: "24.0000",
      levyAmount: "0.0000",
      grossAmount: "124.0000",
    },
  ],
};

describe("fiscal document download API", () => {
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

  it("downloads issued PDF with deterministic filename", async () => {
    vi.mocked(getFiscalDocumentUseCase.execute).mockResolvedValue(
      Result.ok(issuedPayload) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/documents/d1/download",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await download(req, {
      params: Promise.resolve({ documentId: "d1" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="invoice-A-000123.pdf"',
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("utf8", 0, 5)).toBe("%PDF-");
  });

  it("rejects draft download", async () => {
    vi.mocked(getFiscalDocumentUseCase.execute).mockResolvedValue(
      Result.ok({
        ...issuedPayload,
        document: { ...issuedPayload.document, status: "DRAFT" },
        documentNumber: null,
      }) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/documents/d1/download",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await download(req, {
      params: Promise.resolve({ documentId: "d1" }),
    });
    expect(res.status).toBe(400);
  });

  it("maps forged/unauthorized document errors", async () => {
    vi.mocked(getFiscalDocumentUseCase.execute).mockResolvedValue(
      Result.fail(new NotFoundError("FiscalDocument", "x")) as never,
    );
    const req = new NextRequest(
      "http://localhost/api/admin/v1/fiscal/documents/x/download",
      { headers: { "x-tenant-id": "tenant-1" } },
    );
    const res = await download(req, {
      params: Promise.resolve({ documentId: "x" }),
    });
    expect(res.status).toBe(404);

    vi.mocked(getFiscalDocumentUseCase.execute).mockResolvedValue(
      Result.fail(new ForbiddenError("Property access denied")) as never,
    );
    const res2 = await download(req, {
      params: Promise.resolve({ documentId: "x" }),
    });
    expect(res2.status).toBe(403);
  });
});
