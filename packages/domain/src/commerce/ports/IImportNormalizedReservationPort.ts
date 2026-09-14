import type { Booking } from "../booking/domain/Booking";
import type { Result } from "../../shared/kernel/Result";
import type { NormalizedReservationCommand } from "../reservation/types";

export interface ImportNormalizedReservationCommand {
  reservation: NormalizedReservationCommand;
  channelImportKey: string;
}

export interface IImportNormalizedReservationPort {
  execute(command: ImportNormalizedReservationCommand): Promise<Result<Booking, Error>>;
}
