import { ValidationError } from "../../shared/errors/DomainError";
import type { FiscalDocumentKind } from "../documents/FiscalDocumentKinds";

/**
 * Greek fiscal mapping — adapter/configuration concern.
 * Keep AADE / myDATA codes OUT of FiscalDocument aggregate business logic.
 *
 * Verified against myDATA technical v2.0.2 invoice-type appendix:
 * - 2.1 Τιμολόγιο Παροχής
 * - 11.2 ΑΠΥ
 * - 11.4 Πιστωτικό Στοιχείο Λιανικής
 * - 8.2 Τέλος ανθεκτικότητας κλιματικής κρίσης
 * - 5.1 Πιστωτικό Τιμολόγιο / Συσχετιζόμενο (B2B associated credit)
 */

export interface GreekFiscalMapping {
  myDataInvoiceType: string;
  labelEl: string;
  labelEn: string;
  legalSource: string;
  legalVersion: string;
}

const VERIFIED: Record<FiscalDocumentKind, GreekFiscalMapping> = {
  SERVICE_INVOICE: {
    myDataInvoiceType: "2.1",
    labelEl: "Τιμολόγιο Παροχής",
    labelEn: "Service invoice",
    legalSource: "AADE myDATA API Documentation v2.0.2 — Παράρτημα είδη παραστατικών",
    legalVersion: "myDATA-v2.0.2",
  },
  SERVICE_RECEIPT: {
    myDataInvoiceType: "11.2",
    labelEl: "Απόδειξη Παροχής Υπηρεσιών (ΑΠΥ)",
    labelEn: "Service receipt (APY)",
    legalSource: "AADE myDATA API Documentation v2.0.2 — Παράρτημα είδη παραστατικών",
    legalVersion: "myDATA-v2.0.2",
  },
  RETAIL_CREDIT: {
    myDataInvoiceType: "11.4",
    labelEl: "Πιστωτικό Στοιχείο Λιανικής",
    labelEn: "Retail credit note",
    legalSource: "AADE myDATA API Documentation v2.0.2 — Παράρτημα είδη παραστατικών",
    legalVersion: "myDATA-v2.0.2",
  },
  SERVICE_CREDIT: {
    myDataInvoiceType: "5.1",
    labelEl: "Πιστωτικό Τιμολόγιο (συσχετιζόμενο)",
    labelEn: "Associated credit invoice",
    legalSource: "AADE myDATA API Documentation v2.0.2 — Παράρτημα είδη παραστατικών",
    legalVersion: "myDATA-v2.0.2",
  },
  CLIMATE_RESILIENCE_FEE_RECEIPT: {
    myDataInvoiceType: "8.2",
    labelEl: "Ειδικό Παραστατικό – Τέλος Ανθεκτικότητας στην Κλιματική Κρίση",
    labelEn: "Climate Resilience Fee special element",
    legalSource: "AADE myDATA API Documentation v2.0.2 — Παράρτημα είδη παραστατικών",
    legalVersion: "myDATA-v2.0.2",
  },
};

export class GreekFiscalDocumentMapper {
  map(kind: FiscalDocumentKind): GreekFiscalMapping {
    const mapping = VERIFIED[kind];
    if (!mapping) {
      throw new ValidationError(
        `Unsupported Greek fiscal mapping for document kind: ${kind}`,
      );
    }
    return { ...mapping };
  }

  tryMap(kind: FiscalDocumentKind): GreekFiscalMapping | null {
    const mapping = VERIFIED[kind];
    return mapping ? { ...mapping } : null;
  }
}

export const greekFiscalDocumentMapper = new GreekFiscalDocumentMapper();
