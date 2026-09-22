/**
 * Fake remote ARI snapshot reader for initial sync / reconciliation (no live HTTP).
 */
export interface BookingComRemoteAriCell {
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly ratePlanId: string | null;
  readonly date: string;
  readonly field:
    | "roomstosell"
    | "closed"
    | "price"
    | "minstay"
    | "maxstay"
    | "cta"
    | "ctd";
  readonly value: string | number | boolean | null;
}

export interface BookingComRemoteAriSnapshot {
  readonly hotelId: string;
  readonly from: string;
  readonly to: string;
  readonly cells: readonly BookingComRemoteAriCell[];
  readonly fingerprint: string;
}

export interface IBookingComRemoteAriReader {
  read(input: {
    hotelId: string;
    from: string;
    to: string;
  }): Promise<BookingComRemoteAriSnapshot>;
}

export class BookingComRemoteAriReaderNotConfigured implements IBookingComRemoteAriReader {
  async read(): Promise<BookingComRemoteAriSnapshot> {
    throw new Error("BOOKING_COM_REMOTE_ARI_READER_NOT_CONFIGURED");
  }
}

export class FakeBookingComRemoteAriReader implements IBookingComRemoteAriReader {
  constructor(private readonly snapshot: BookingComRemoteAriSnapshot) {}

  async read(input: {
    hotelId: string;
    from: string;
    to: string;
  }): Promise<BookingComRemoteAriSnapshot> {
    if (input.hotelId !== this.snapshot.hotelId) {
      return {
        hotelId: input.hotelId,
        from: input.from,
        to: input.to,
        cells: [],
        fingerprint: "empty",
      };
    }
    return this.snapshot;
  }
}
