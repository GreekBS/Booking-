import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { NormalizedReservationCommand } from "../../commerce/reservation/types";

export interface ChannelReservationImportMappingContext {
  mappingId: string;
  mappingVersion: number;
  propertyId: string;
  unitId: string;
  connectionId: string;
}

export type ImportChannelReservationCreateDryRunResult =
  | {
      duplicate: true;
      existingLink: ExternalReservationLink;
      command: null;
      mappingVersionUsed: number;
    }
  | {
      duplicate: false;
      command: NormalizedReservationCommand;
      mappingContext: ChannelReservationImportMappingContext;
      mappingVersionUsed: number;
    };
