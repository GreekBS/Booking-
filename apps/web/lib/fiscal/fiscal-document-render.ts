export interface FiscalDocumentRenderModel {
  documentId: string;
  documentKind: string;
  status: string;
  documentNumber: string | null;
  seriesCode: string | null;
  sequentialNumber: number | null; // maps from FiscalDocument.sequenceNumber
  issuedAt: string | null;
  currency: string;
  localStatusLabel: string;
  greekMappingLabel: string;
  issuer: {
    legalName: string;
    tradeName: string | null;
    vatNumber: string | null;
    addressLine: string;
  } | null;
  customer: {
    legalName: string;
    type: string;
    vatNumber: string | null;
    country: string;
    addressLine: string | null;
    email: string | null;
  } | null;
  lines: Array<{
    description: string;
    netAmount: string;
    vatAmount: string;
    levyAmount: string;
    grossAmount: string;
  }>;
  totals: {
    netTotal: string;
    vatTotal: string;
    levyTotal: string;
    grossTotal: string;
  };
}

function escHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFiscalDocumentRenderModel(input: {
  document: {
    id: string;
    documentKind: string;
    status: string;
    seriesCode: string | null;
    sequenceNumber: number | null;
    issuedAt: Date | string | null;
    currency: string;
    issuerSnapshot: {
      legalName: string;
      tradeName: string | null;
      vatNumber: string | null;
      address: {
        line1: string;
        line2?: string | null;
        city: string;
        region?: string | null;
        postalCode: string;
        country: string;
      };
    } | null;
    customerSnapshot: {
      legalName: string;
      type: string;
      vatNumber: string | null;
      country: string;
      email: string | null;
      address: {
        line1: string;
        line2?: string | null;
        city: string;
        region?: string | null;
        postalCode: string;
        country: string;
      } | null;
    } | null;
    totals: {
      netTotal: string;
      vatTotal: string;
      levyTotal: string;
      grossTotal: string;
    };
  };
  lines: Array<{
    description: string;
    netAmount: string;
    vatAmount: string;
    levyAmount: string;
    grossAmount: string;
  }>;
  documentNumber: string | null;
  localStatusLabel: string;
  greekMapping: { myDataInvoiceType: string; labelEn: string };
}): FiscalDocumentRenderModel {
  const issuer = input.document.issuerSnapshot;
  const customer = input.document.customerSnapshot;
  const formatAddress = (
    a:
      | {
          line1: string;
          line2?: string | null;
          city: string;
          region?: string | null;
          postalCode: string;
          country: string;
        }
      | null
      | undefined,
  ): string | null => {
    if (!a) return null;
    return [
      a.line1,
      a.line2,
      [a.postalCode, a.city].filter(Boolean).join(" "),
      a.region,
      a.country,
    ]
      .filter((p) => p && String(p).trim().length > 0)
      .join(", ");
  };

  const issuedAt =
    input.document.issuedAt == null
      ? null
      : typeof input.document.issuedAt === "string"
        ? input.document.issuedAt
        : input.document.issuedAt.toISOString();

  return {
    documentId: input.document.id,
    documentKind: input.document.documentKind,
    status: input.document.status,
    documentNumber: input.documentNumber,
    seriesCode: input.document.seriesCode,
    sequentialNumber: input.document.sequenceNumber,
    issuedAt,
    currency: input.document.currency,
    localStatusLabel: input.localStatusLabel,
    greekMappingLabel: `${input.greekMapping.myDataInvoiceType} ${input.greekMapping.labelEn}`,
    issuer: issuer
      ? {
          legalName: issuer.legalName,
          tradeName: issuer.tradeName,
          vatNumber: issuer.vatNumber,
          addressLine: formatAddress(issuer.address) ?? "",
        }
      : null,
    customer: customer
      ? {
          legalName: customer.legalName,
          type: customer.type,
          vatNumber: customer.vatNumber,
          country: customer.country,
          addressLine: formatAddress(customer.address),
          email: customer.email,
        }
      : null,
    lines: input.lines.map((l) => ({
      description: l.description,
      netAmount: l.netAmount,
      vatAmount: l.vatAmount,
      levyAmount: l.levyAmount,
      grossAmount: l.grossAmount,
    })),
    totals: { ...input.document.totals },
  };
}

/** Snapshot-only HTML representation (print / fallback). */
export function renderFiscalDocumentHtml(model: FiscalDocumentRenderModel): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escHtml(model.documentNumber ?? "Draft")} — Fiscal document</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    .meta { color: #444; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border-bottom: 1px solid #ddd; padding: 0.4rem 0.5rem; text-align: left; font-size: 0.9rem; }
    th { font-weight: 600; }
    .totals { margin-top: 1.25rem; width: 18rem; margin-left: auto; }
    .totals td { border: none; }
    .notice { margin-top: 2rem; padding: 0.75rem; background: #f5f5f5; font-size: 0.85rem; }
    @media print { .notice { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${escHtml(model.documentNumber ?? "DRAFT")}</h1>
  <div class="meta">
    ${escHtml(model.documentKind)} · ${escHtml(model.localStatusLabel)} · ${escHtml(model.status)}<br/>
    Issued: ${escHtml(model.issuedAt ?? "—")}<br/>
    Greek mapping (informational): ${escHtml(model.greekMappingLabel)}
  </div>
  <section>
    <strong>Issuer</strong><br/>
    ${escHtml(model.issuer?.legalName)}
    ${model.issuer?.tradeName ? `<br/>${escHtml(model.issuer.tradeName)}` : ""}
    ${model.issuer?.vatNumber ? `<br/>VAT/AFM: ${escHtml(model.issuer.vatNumber)}` : ""}
    ${model.issuer?.addressLine ? `<br/>${escHtml(model.issuer.addressLine)}` : ""}
  </section>
  <section style="margin-top:1rem">
    <strong>Recipient</strong><br/>
    ${escHtml(model.customer?.legalName ?? "—")}
    ${model.customer?.type ? ` (${escHtml(model.customer.type)})` : ""}
    ${model.customer?.vatNumber ? `<br/>VAT/AFM: ${escHtml(model.customer.vatNumber)}` : ""}
    ${model.customer?.addressLine ? `<br/>${escHtml(model.customer.addressLine)}` : ""}
    ${model.customer?.email ? `<br/>${escHtml(model.customer.email)}` : ""}
  </section>
  <table>
    <thead>
      <tr><th>#</th><th>Description</th><th>Net</th><th>VAT</th><th>Levy / fee</th><th>Gross</th></tr>
    </thead>
    <tbody>
      ${model.lines
        .map(
          (l, i) =>
            `<tr><td>${i + 1}</td><td>${escHtml(l.description)}</td><td>${escHtml(l.netAmount)}</td><td>${escHtml(l.vatAmount)}</td><td>${escHtml(l.levyAmount)}</td><td>${escHtml(l.grossAmount)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Net</td><td>${escHtml(model.totals.netTotal)} ${escHtml(model.currency)}</td></tr>
    <tr><td>VAT</td><td>${escHtml(model.totals.vatTotal)}</td></tr>
    <tr><td>Other / levy (not VAT)</td><td>${escHtml(model.totals.levyTotal)}</td></tr>
    <tr><td><strong>Gross</strong></td><td><strong>${escHtml(model.totals.grossTotal)}</strong></td></tr>
  </table>
  <div class="notice">
    Rendered exclusively from the immutable FiscalDocument snapshot.
    Local issuance only — not transmitted to AADE/myDATA.
  </div>
</body>
</html>`;
}

/** Real PDF bytes from immutable snapshot values (pdfkit). */
export async function renderFiscalDocumentPdf(
  model: FiscalDocumentRenderModel,
): Promise<Buffer> {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(model.documentNumber ?? "DRAFT");
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#333")
      .text(`${model.documentKind} · ${model.localStatusLabel}`)
      .text(`Issued: ${model.issuedAt ?? "—"}`)
      .text(`Greek mapping (informational): ${model.greekMappingLabel}`);
    doc.moveDown();
    doc.fillColor("#000").fontSize(11).text("Issuer", { underline: true });
    doc.fontSize(10).text(model.issuer?.legalName ?? "—");
    if (model.issuer?.tradeName) doc.text(model.issuer.tradeName);
    if (model.issuer?.vatNumber) doc.text(`VAT/AFM: ${model.issuer.vatNumber}`);
    if (model.issuer?.addressLine) doc.text(model.issuer.addressLine);
    doc.moveDown();
    doc.fontSize(11).text("Recipient", { underline: true });
    doc
      .fontSize(10)
      .text(
        `${model.customer?.legalName ?? "—"}${model.customer?.type ? ` (${model.customer.type})` : ""}`,
      );
    if (model.customer?.vatNumber) doc.text(`VAT/AFM: ${model.customer.vatNumber}`);
    if (model.customer?.addressLine) doc.text(model.customer.addressLine);
    if (model.customer?.email) doc.text(model.customer.email);
    doc.moveDown();
    doc.fontSize(11).text("Lines", { underline: true });
    doc.moveDown(0.3);
    for (const [i, line] of model.lines.entries()) {
      doc
        .fontSize(9)
        .text(
          `${i + 1}. ${line.description} | net ${line.netAmount} | VAT ${line.vatAmount} | levy ${line.levyAmount} | gross ${line.grossAmount}`,
        );
    }
    doc.moveDown();
    doc.fontSize(11).text("Totals", { underline: true });
    doc
      .fontSize(10)
      .text(`Net: ${model.totals.netTotal} ${model.currency}`)
      .text(`VAT: ${model.totals.vatTotal}`)
      .text(`Other / levy (not VAT): ${model.totals.levyTotal}`)
      .text(`Gross: ${model.totals.grossTotal} ${model.currency}`);
    doc.moveDown();
    doc
      .fontSize(8)
      .fillColor("#555")
      .text(
        "Rendered exclusively from the immutable FiscalDocument snapshot. Local issuance only — not transmitted to AADE/myDATA.",
      );

    doc.end();
  });
}
