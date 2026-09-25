import { describe, expect, it } from "vitest";
import { buildFiscalDocumentDownloadFilename } from "../../src/fiscal/documents/fiscalDocumentDownloadFilename";

describe("fiscalDocumentDownloadFilename", () => {
  it("builds invoice filename from series and number", () => {
    expect(
      buildFiscalDocumentDownloadFilename({
        documentKind: "SERVICE_INVOICE",
        seriesCode: "A",
        sequentialNumber: 123,
        documentId: "11111111-1111-4111-8111-111111111111",
        extension: "pdf",
      }),
    ).toBe("invoice-A-000123.pdf");
  });

  it("builds receipt / credit / climate prefixes", () => {
    expect(
      buildFiscalDocumentDownloadFilename({
        documentKind: "SERVICE_RECEIPT",
        seriesCode: "R",
        sequentialNumber: 1,
        documentId: "x",
        extension: "pdf",
      }),
    ).toBe("receipt-R-000001.pdf");
    expect(
      buildFiscalDocumentDownloadFilename({
        documentKind: "SERVICE_CREDIT",
        seriesCode: "C",
        sequentialNumber: 9,
        documentId: "x",
        extension: "pdf",
      }),
    ).toBe("credit-C-000009.pdf");
    expect(
      buildFiscalDocumentDownloadFilename({
        documentKind: "CLIMATE_RESILIENCE_FEE_RECEIPT",
        seriesCode: "CL",
        sequentialNumber: 42,
        documentId: "x",
        extension: "pdf",
      }),
    ).toBe("climate-fee-receipt-CL-000042.pdf");
  });

  it("falls back for drafts without sequence", () => {
    const name = buildFiscalDocumentDownloadFilename({
      documentKind: "SERVICE_INVOICE",
      seriesCode: null,
      sequentialNumber: null,
      documentId: "abcdef12-1111-4111-8111-111111111111",
      extension: "pdf",
    });
    expect(name.startsWith("invoice-draft-")).toBe(true);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});
