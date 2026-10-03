import type { CsvImportCanonicalField } from "./types";
import { normalizeCsvHeader } from "./normalizeHeader";

/**
 * Normalized header → canonical field.
 * Keep conservative: only unambiguous common EN/EL / OTA-ish labels.
 */
const ALIAS_ENTRIES: ReadonlyArray<readonly [string, CsvImportCanonicalField]> = [
  // externalReference
  ["external_reference", "externalReference"],
  ["external_ref", "externalReference"],
  ["reservation_id", "externalReference"],
  ["reservation_number", "externalReference"],
  ["booking_id", "externalReference"],
  ["booking_reference", "externalReference"],
  ["booking_ref", "externalReference"],
  ["reference", "externalReference"],
  ["ref", "externalReference"],
  ["confirmation_code", "externalReference"],
  ["confirmation_number", "externalReference"],
  ["id_κρατησης", "externalReference"],
  ["κωδικος_κρατησης", "externalReference"],
  ["αναφορα", "externalReference"],

  // unitRef
  ["unit", "unitRef"],
  ["unit_id", "unitRef"],
  ["unit_name", "unitRef"],
  ["unit_slug", "unitRef"],
  ["room", "unitRef"],
  ["room_name", "unitRef"],
  ["room_type", "unitRef"],
  ["listing", "unitRef"],
  ["property_unit", "unitRef"],
  ["μοναδα", "unitRef"],
  ["δωματιο", "unitRef"],
  ["διαμερισμα", "unitRef"],
  ["καταλυμα_μοναδα", "unitRef"],

  // guestName
  ["guest_name", "guestName"],
  ["guest", "guestName"],
  ["name", "guestName"],
  ["full_name", "guestName"],
  ["customer_name", "guestName"],
  ["traveler_name", "guestName"],
  ["ονομα", "guestName"],
  ["ονομα_επισκεπτη", "guestName"],
  ["ονοματεπωνυμο", "guestName"],

  // guestEmail
  ["guest_email", "guestEmail"],
  ["email", "guestEmail"],
  ["e_mail", "guestEmail"],
  ["customer_email", "guestEmail"],
  ["ημαιλ", "guestEmail"],
  ["email_επισκεπτη", "guestEmail"],

  // guestPhone
  ["guest_phone", "guestPhone"],
  ["phone", "guestPhone"],
  ["telephone", "guestPhone"],
  ["mobile", "guestPhone"],
  ["τηλεφωνο", "guestPhone"],

  // checkIn
  ["check_in", "checkIn"],
  ["checkin", "checkIn"],
  ["arrival", "checkIn"],
  ["arrival_date", "checkIn"],
  ["start_date", "checkIn"],
  ["αφιξη", "checkIn"],
  ["ημερομηνια_αφιξης", "checkIn"],

  // checkOut
  ["check_out", "checkOut"],
  ["checkout", "checkOut"],
  ["departure", "checkOut"],
  ["departure_date", "checkOut"],
  ["end_date", "checkOut"],
  ["αναχωρηση", "checkOut"],
  ["ημερομηνια_αναχωρησης", "checkOut"],

  // guestCount
  ["guest_count", "guestCount"],
  ["guests", "guestCount"],
  ["adults", "guestCount"],
  ["number_of_guests", "guestCount"],
  ["pax", "guestCount"],
  ["αριθμος_επισκεπτων", "guestCount"],
  ["επισκεπτες", "guestCount"],

  // totalAmount
  ["total", "totalAmount"],
  ["total_amount", "totalAmount"],
  ["total_price", "totalAmount"],
  ["price", "totalAmount"],
  ["amount", "totalAmount"],
  ["grand_total", "totalAmount"],
  ["συνολο", "totalAmount"],
  ["τιμη", "totalAmount"],
  ["ποσο", "totalAmount"],

  // currency
  ["currency", "currency"],
  ["currency_code", "currency"],
  ["νομισμα", "currency"],

  // channelSource
  ["channel", "channelSource"],
  ["source", "channelSource"],
  ["booking_source", "channelSource"],
  ["ota", "channelSource"],
  ["πηγη", "channelSource"],
  ["καναλι", "channelSource"],

  // notes
  ["notes", "notes"],
  ["note", "notes"],
  ["comments", "notes"],
  ["comment", "notes"],
  ["remarks", "notes"],
  ["σημειωσεις", "notes"],
];

const ALIAS_MAP: ReadonlyMap<string, CsvImportCanonicalField> = new Map(
  ALIAS_ENTRIES.map(([alias, field]) => [normalizeCsvHeader(alias), field]),
);

export function lookupCanonicalFieldAlias(
  header: string,
): CsvImportCanonicalField | null {
  return ALIAS_MAP.get(normalizeCsvHeader(header)) ?? null;
}

/** Test/inspection helper: all known normalized aliases. */
export function listCsvImportHeaderAliases(): ReadonlyMap<
  string,
  CsvImportCanonicalField
> {
  return ALIAS_MAP;
}
