/**
 * Versioned Greek statutory VAT jurisdiction location catalog.
 *
 * Source: AADE circular E.2113/2025 annex (31 Dec 2025) enumerating islands/islets
 * eligible for 30% VAT rate reduction under VAT Code Art. 26 (Law 5144/2024),
 * as amended by Law 5246/2025.
 *
 * - Lesvos, Kos, Samos, Chios: continuing eligibility (Art. 26 §4 / A.1150/2021).
 * - Remaining annex locations: expansion effective 2026-01-01 (Art. 26 §4A).
 *
 * Do NOT infer eligibility from population/region at runtime — only this catalog.
 * Future legal changes → new effective-dated catalog entries (never rewrite history).
 */

export type GreekLocationKind = "mainland" | "eligible_island" | "eligible_islet";

export interface GreekFiscalLocationRecord {
  /** Stable identifier — never a free-text island name in TaxEngine. */
  locationId: string;
  displayNameEl: string;
  displayNameEn: string;
  kind: GreekLocationKind;
  /**
   * When true and service conditions are met, resolver yields GR-ISLAND-REDUCED.
   * Mainland is never reduced via this flag.
   */
  eligibleForReducedVat: boolean;
  validFrom: string; // ISO date
  validUntil: string | null;
  legalSource: string;
  legalVersion: string;
}

const E2113 =
  "AADE E.2113/2025 annex; VAT Code Art. 26 (Law 5144/2024) as amended by Law 5246/2025";
const E2113_VER = "E.2113/2025";
const A1150 =
  "AADE A.1150/2021 continuing Art. 26 §4 (Lesvos, Kos, Samos, Chios); affirmed E.2113/2025";
const A1150_VER = "A.1150/2021+E.2113/2025";

const CONTINUING_ISLANDS: Array<{ id: string; el: string; en: string }> = [
  { id: "gr-island:lesvos", el: "Λέσβος", en: "Lesvos" },
  { id: "gr-island:kos", el: "Κως", en: "Kos" },
  { id: "gr-island:samos", el: "Σάμος", en: "Samos" },
  { id: "gr-island:chios", el: "Χίος", en: "Chios" },
];

const EXPANSION_2026_ISLANDS: Array<{ id: string; el: string; en: string }> = [
  { id: "gr-island:agathonisi", el: "Αγαθονήσιον", en: "Agathonisi" },
  { id: "gr-island:agios-efstratios", el: "Άγιος Ευστράτιος", en: "Agios Efstratios" },
  { id: "gr-island:astypalaia", el: "Αστυπάλαια", en: "Astypalaia" },
  { id: "gr-island:ikaria", el: "Ικαρία", en: "Ikaria" },
  { id: "gr-island:kalymnos", el: "Κάλυμνος", en: "Kalymnos" },
  { id: "gr-island:karpathos", el: "Κάρπαθος", en: "Karpathos" },
  { id: "gr-island:kasos", el: "Κάσος", en: "Kasos" },
  { id: "gr-island:leipsoi", el: "Λειψοί", en: "Leipsoi" },
  { id: "gr-island:leros", el: "Λέρος", en: "Leros" },
  { id: "gr-island:limnos", el: "Λήμνος", en: "Limnos" },
  { id: "gr-island:megisti", el: "Μεγίστη", en: "Megisti (Kastellorizo)" },
  { id: "gr-island:nisyros", el: "Νίσυρος", en: "Nisyros" },
  { id: "gr-island:oinousses", el: "Οινουσσών", en: "Oinousses" },
  { id: "gr-island:patmos", el: "Πάτμος", en: "Patmos" },
  { id: "gr-island:samothraki", el: "Σαμοθράκη", en: "Samothraki" },
  { id: "gr-island:symi", el: "Σύμη", en: "Symi" },
  { id: "gr-island:tilos", el: "Τήλος", en: "Tilos" },
  { id: "gr-island:fournoi", el: "Φούρνοι", en: "Fournoi" },
  { id: "gr-island:chalki", el: "Χάλκη", en: "Chalki" },
  { id: "gr-island:psara", el: "Ψαρών", en: "Psara" },
];

/**
 * Annex νησίδες (islets) — ordered as in AADE E.2113/2025 παράρτημα.
 * Stable IDs use annex ordinal to avoid collisions on duplicate Greek names.
 */
const ANNEX_ISLETS_EL: string[] = [
  "Αβάπτιστος",
  "Αγία Θέκλα",
  "Αγία Κυριακή",
  "Άγιο Νικολάκι",
  "Άγιοι Απόστολοι",
  "Άγιος Αντώνιος",
  "Άγιος Βασίλειος",
  "Άγιος Γεώργιος",
  "Άγιος Γεώργιος (2)",
  "Άγιος Γεώργιος (Δ.Καλλονής)",
  "Άγιος Γεώργιος (Δ.Πέτρας)",
  "Άγιος Θεόδωρος",
  "Άγιος Μηνάς",
  "Άγιος Νικόλαος",
  "Άγιος Παντελεήμων",
  "Άγιος Στέφανος",
  "Άγιος Στέφανος (2)",
  "Αγρελούσσα",
  "Άγρια Γραμβούσα",
  "Αγριελιά",
  "Αδελφοί",
  "Αλατονήσι",
  "Αλιμιά",
  "Αλογονήσιο",
  "Ανθρωποφάς",
  "Αντίτηλος",
  "Αντίψαρα",
  "Άνυδρο",
  "Αρκοί",
  "Αρμάθια",
  "Αρχάγγελος",
  "Αρχοντόνησο",
  "Άσπρη Πλακούδα",
  "Ασπρονήσια",
  "Αστακίδα",
  "Ατσακιδόπουλο",
  "Αυγό",
  "Άφωτη",
  "Βάτος",
  "Βελόνα",
  "Βενέτικο",
  "Γάδρος",
  "Γάιδαρος",
  "Γαϊδουρονήσι",
  "Γαϊδουρόνησος",
  "Γιαλεσίνο",
  "Γλάρος",
  "Γλάρος (2)",
  "Γλαστριά",
  "Γλυνό",
  "Γυαλί",
  "Δακαλιό",
  "Δεσποτικό",
  "Διαβάτες",
  "Διακόφτης",
  "Διαπόρτι",
  "Διβούνια",
  "Ζαφοράς",
  "Ημερη Γραμβούσα",
  "Θύμαινα",
  "Θυμαινάκι",
  "Ίμια - Λιμνιά δύο",
  "Ίμια - Λιμνιά ένα",
  "Καΐκι",
  "Καλαβρός",
  "Καλόβολος",
  "Καλόγερος",
  "Καλόλιμνος",
  "Κανδελιούσσα",
  "Καράβι",
  "Καροφύλλα",
  "Κασονήσι",
  "Καστριά",
  "Κάστωρ",
  "Κατσαγρέλλι",
  "Κάτω Νησί",
  "Κάτω Πρασούα",
  "Κέρτης",
  "Κίναρος",
  "Κισηριά",
  "Κολόφονας",
  "Κόμαρος",
  "Κόμπιον",
  "Κούδρος – Κεντρονήσι",
  "Κουκονήσιο",
  "Κουλούνδρος",
  "Κουνέλι",
  "Κουνούποι",
  "Κούρικα",
  "Κουτσομύτι",
  "Κρεβάτια",
  "Λέβιθα",
  "Λίτρα",
  "Μαελονήσι",
  "Μακρή",
  "Μακρονήσι",
  "Μακρονήσι (2)",
  "Μακρονήσι (3)",
  "Μακρόνησο",
  "Μαλλιαρόπετρα",
  "Μάραθος",
  "Μαργαρίτι",
  "Μαρμαράς",
  "Μαστρογιώργη",
  "Μαύρα",
  "Μαύρη Πλακούδα",
  "Μαύρο Ποϊνί Μεγάλο",
  "Μαύρο Ποινί",
  "Μεγάλο Λιβάδι",
  "Μεγαλονήσιον",
  "Μεσονήσι",
  "Μικρό Σόφρανο",
  "Μικρός Ανθρωποφάς",
  "Μοίρα",
  "Μονάφτης",
  "Μπαρμπαλιάς",
  "Νερά",
  "Νερά (2)",
  "Νερά (3)",
  "Νήπουρι",
  "Νησάκι",
  "Νησί Παναγιάς",
  "Νησί Πίττας",
  "Νησί",
  "Νίμος",
  "Νισιερός",
  "Οφιδούσσα",
  "Παναγιά",
  "Πάνω Πρασούα",
  "Παπαποντικάδικο",
  "Πατερόνησο",
  "Παχειά",
  "Πελαγόνησος",
  "Περγούσσα",
  "Πετροκάραβο",
  "Πετροκάραβο (2)",
  "Πηγανούσσα",
  "Πλάκα",
  "Πλάκα (2)",
  "Πλάκα (3)",
  "Πλακάκι",
  "Πλακίδα",
  "Πλάτη",
  "Πλάτη (2)",
  "Πολύφαδος ένα",
  "Ποντικονήσια",
  "Ποντικονήσι",
  "Ποντικούσα",
  "Ποριονήσι",
  "Πόχης",
  "Πρασονήσια",
  "Πρασονήσιο",
  "Πρασονήσι",
  "Πρασονήσι (2)",
  "Ρούμπος",
  "Ρω",
  "Σαβούρα",
  "Σαμιοπούλα",
  "Σάντα Παναγιά",
  "Σαρακηνόπετρα",
  "Σαριά",
  "Σαφονήδι",
  "Σεργίτσι",
  "Σεσκλίον",
  "Σκλάβες",
  "Σμυνερονήσι",
  "Σοχάς",
  "Σπαθαθονήσι",
  "Στεφάνια",
  "Στροβίλι",
  "Στρογγυλή",
  "Στρογγυλή (2)",
  "Στρογγύλη",
  "Στρογγύλη (2)",
  "Στρογγύλη (3)",
  "Στρογγυλό",
  "Στρογγυλό (2)",
  "Στρογγυλό (3)",
  "Σύρνα",
  "Σφύρα",
  "Σώκαστρο",
  "Τέλενδος",
  "Τηγάνι",
  "Τραγονέρα",
  "Τραγονήσι",
  "Τραγούσα",
  "Τράχηλας",
  "Τρυπητή",
  "Τρυπητή (2)",
  "Τσούκα",
  "Τσούκα (2)",
  "Τσουκάκι",
  "Τσουκαλάς",
  "Φαρμακονήσιον",
  "Φράγκος",
  "Φωκάς",
  "Φωκιονήσια",
  "Χαμηλή",
  "Χαρκιάς",
  "Χήνα",
  "Χιλιομόδι",
  "Χονδρονήσι",
  "Χονδρός",
  "Χονδρό",
  "Χτένι",
  "Ψαθονήσιο",
  "Ψαθονήσι",
  "Ψείρα",
  "Ψέριμος",
  "Ψωμί",
  "Ψωραδιά",
];

function islandRecord(
  entry: { id: string; el: string; en: string },
  validFrom: string,
  legalSource: string,
  legalVersion: string,
): GreekFiscalLocationRecord {
  return {
    locationId: entry.id,
    displayNameEl: entry.el,
    displayNameEn: entry.en,
    kind: "eligible_island",
    eligibleForReducedVat: true,
    validFrom,
    validUntil: null,
    legalSource,
    legalVersion,
  };
}

let cached: GreekFiscalLocationRecord[] | null = null;

export function greekFiscalJurisdictionCatalog2026(): readonly GreekFiscalLocationRecord[] {
  if (cached) return cached;
  const rows: GreekFiscalLocationRecord[] = [
    {
      locationId: "gr-mainland",
      displayNameEl: "Ηπειρωτική / λοιπή Ελλάδα",
      displayNameEn: "Mainland / rest of Greece",
      kind: "mainland",
      eligibleForReducedVat: false,
      validFrom: "2016-06-01",
      validUntil: null,
      legalSource: "AADE Basic VAT rates (standard jurisdiction)",
      legalVersion: "AADE-basic-rates",
    },
  ];

  for (const island of CONTINUING_ISLANDS) {
    rows.push(islandRecord(island, "2021-07-01", A1150, A1150_VER));
  }
  for (const island of EXPANSION_2026_ISLANDS) {
    rows.push(islandRecord(island, "2026-01-01", E2113, E2113_VER));
  }
  ANNEX_ISLETS_EL.forEach((el, index) => {
    rows.push({
      locationId: `gr-islet:e2113-${String(index + 1).padStart(3, "0")}`,
      displayNameEl: el,
      displayNameEn: `Annex islet #${index + 1}`,
      kind: "eligible_islet",
      eligibleForReducedVat: true,
      validFrom: "2026-01-01",
      validUntil: null,
      legalSource: E2113,
      legalVersion: E2113_VER,
    });
  });

  cached = rows;
  return cached;
}

/**
 * Locations that are Greek but not on the reduced-VAT annex (e.g. Crete).
 * Operators select these explicitly; resolver yields GR — never reduced.
 */
export const GREEK_STANDARD_RATE_LOCATIONS: readonly GreekFiscalLocationRecord[] =
  [
    {
      locationId: "gr-other:crete",
      displayNameEl: "Κρήτη",
      displayNameEn: "Crete",
      kind: "mainland",
      eligibleForReducedVat: false,
      validFrom: "2016-06-01",
      validUntil: null,
      legalSource: "AADE Basic VAT rates — not listed in E.2113/2025 annex",
      legalVersion: "AADE-basic-rates",
    },
  ];

export function findGreekFiscalLocation(
  locationId: string,
  asOf: Date,
  catalog: readonly GreekFiscalLocationRecord[] = [
    ...greekFiscalJurisdictionCatalog2026(),
    ...GREEK_STANDARD_RATE_LOCATIONS,
  ],
): GreekFiscalLocationRecord[] {
  const day = asOf.toISOString().slice(0, 10);
  return catalog.filter((row) => {
    if (row.locationId !== locationId) return false;
    if (day < row.validFrom) return false;
    if (row.validUntil && day >= row.validUntil) return false;
    return true;
  });
}

/** Full operator-facing catalog (eligible annex + standard-rate Greek locations). */
export function greekFiscalLocationCatalogForOperator(): readonly GreekFiscalLocationRecord[] {
  return [
    ...greekFiscalJurisdictionCatalog2026(),
    ...GREEK_STANDARD_RATE_LOCATIONS,
  ];
}
