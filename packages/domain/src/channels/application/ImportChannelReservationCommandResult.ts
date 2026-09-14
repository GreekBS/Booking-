import type { Booking } from "../../commerce/booking/domain/Booking";
import type { NormalizedReservationCommand } from "../../commerce/reservation/types";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { ChannelSource } from "../types/ChannelSource";
import type { ChannelReservationImportMappingContext } from "./ImportChannelReservationCreateDryRunResult";

export interface ImportChannelReservationExternalMetadata {
  provider: ChannelSource;
  connectionId: string;
  externalReservationId: string;
  externalRevision?: string | null;
  lastExternalUpdateAt?: string | null;
}

export interface ImportChannelReservationCommand {
  normalizedCommand: NormalizedReservationCommand;
  mappingContext: ChannelReservationImportMappingContext;
  external: ImportChannelReservationExternalMetadata;
}

export type ImportChannelReservationCommandResult =
  | {
      outcome: "created";
      booking: Booking;
      link: ExternalReservationLink;
    }
  | {
      outcome: "duplicate";
      link: ExternalReservationLink;
    };
