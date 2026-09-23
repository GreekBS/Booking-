import { NextRequest } from "next/server";
import { getFiscalDocumentUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, mapResultError } from "@/lib/api-error-handler";

/** Printable HTML built exclusively from FiscalDocument snapshot. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { documentId } = await context.params;
    const result = await getFiscalDocumentUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      documentId,
    );
    if (result.isFailure) return mapResultError(result.getError());
    const { document, lines, documentNumber, greekMapping, localStatusLabel } =
      result.getValue();
    const issuer = document.issuerSnapshot;
    const customer = document.customerSnapshot;
    const esc = (s: string | null | undefined) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(documentNumber ?? "Draft")} — Fiscal document</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
    .meta { color: #444; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border-bottom: 1px solid #ddd; padding: 0.4rem 0.5rem; text-align: left; font-size: 0.9rem; }
    th { font-weight: 600; }
    .totals { margin-top: 1.25rem; width: 16rem; margin-left: auto; }
    .totals td { border: none; }
    .notice { margin-top: 2rem; padding: 0.75rem; background: #f5f5f5; font-size: 0.85rem; }
    @media print { .notice { break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${esc(documentNumber ?? "DRAFT")}</h1>
  <div class="meta">
    ${esc(document.documentKind)} · ${esc(localStatusLabel)}<br/>
    Issued: ${esc(document.issuedAt ? new Date(document.issuedAt).toISOString() : "—")}<br/>
    Greek mapping (informational): ${esc(greekMapping.myDataInvoiceType)} ${esc(greekMapping.labelEn)}
  </div>
  <section>
    <strong>Issuer</strong><br/>
    ${esc(issuer?.legalName)} ${issuer?.vatNumber ? `(AFM ${esc(issuer.vatNumber)})` : ""}<br/>
    ${esc(issuer?.address.line1)}, ${esc(issuer?.address.city)} ${esc(issuer?.address.postalCode)}
  </section>
  <section style="margin-top:1rem">
    <strong>Recipient</strong><br/>
    ${esc(customer?.legalName ?? "—")}
    ${customer?.vatNumber ? `(AFM ${esc(customer.vatNumber)})` : ""}
  </section>
  <table>
    <thead>
      <tr><th>#</th><th>Description</th><th>Net</th><th>VAT</th><th>Levy</th><th>Gross</th></tr>
    </thead>
    <tbody>
      ${lines
        .map(
          (l, i) =>
            `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${esc(l.netAmount)}</td><td>${esc(l.vatAmount)}</td><td>${esc(l.levyAmount)}</td><td>${esc(l.grossAmount)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Net</td><td>${esc(document.totals.netTotal)} ${esc(document.currency)}</td></tr>
    <tr><td>VAT</td><td>${esc(document.totals.vatTotal)}</td></tr>
    <tr><td>Other / levy</td><td>${esc(document.totals.levyTotal)}</td></tr>
    <tr><td><strong>Gross</strong></td><td><strong>${esc(document.totals.grossTotal)}</strong></td></tr>
  </table>
  <div class="notice">
    This representation is rendered exclusively from the immutable FiscalDocument snapshot.
    Local issuance only — not transmitted to AADE/myDATA. Pending fiscalization integration.
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return apiError(error);
  }
}
