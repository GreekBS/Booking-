import { NextRequest } from "next/server";
import { ValidationError, buildFiscalDocumentDownloadFilename } from "@hcp/domain";
import { getFiscalDocumentUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, mapResultError } from "@/lib/api-error-handler";
import {
  buildFiscalDocumentRenderModel,
  renderFiscalDocumentPdf,
} from "@/lib/fiscal/fiscal-document-render";

/**
 * Download issued FiscalDocument as a real PDF built from the immutable snapshot.
 * Drafts are rejected — use print preview for drafts.
 */
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
    const value = result.getValue();
    if (value.document.status !== "ISSUED") {
      throw new ValidationError("Only issued fiscal documents can be downloaded");
    }

    const model = buildFiscalDocumentRenderModel({
      document: value.document,
      lines: value.lines,
      documentNumber: value.documentNumber,
      localStatusLabel: value.localStatusLabel,
      greekMapping: value.greekMapping,
    });

    const filename = buildFiscalDocumentDownloadFilename({
      documentKind: model.documentKind,
      seriesCode: model.seriesCode,
      sequentialNumber: model.sequentialNumber,
      documentId: model.documentId,
      extension: "pdf",
    });

    const pdf = await renderFiscalDocumentPdf(model);

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
