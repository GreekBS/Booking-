import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { NormalizedReservationCommand } from "../../commerce/reservation/types";

export type ChannelImportSimulationResult =
  | {
      duplicate: true;
      link: ExternalReservationLink;
      command: null;
      mappingVersionUsed: number;
    }
  | {
      duplicate: false;
      link: ExternalReservationLink;
      command: NormalizedReservationCommand;
      mappingVersionUsed: number;
    };
