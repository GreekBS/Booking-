import type { Booking } from "../booking/domain/Booking";
import { Result } from "../../shared/kernel/Result";
import type {
  IImportNormalizedReservationPort,
  ImportNormalizedReservationCommand,
} from "../ports/IImportNormalizedReservationPort";
import { CreateReservationUseCase } from "./CreateReservationUseCase";
import { createChannelImportActor } from "./channelImportActor";

export class ImportNormalizedReservationAdapter implements IImportNormalizedReservationPort {
  constructor(private readonly createReservationUseCase: CreateReservationUseCase) {}

  async execute(command: ImportNormalizedReservationCommand): Promise<Result<Booking, Error>> {
    const { reservation, channelImportKey } = command;

    return this.createReservationUseCase.execute({
      reservation,
      profile: {
        confirmImmediately: true,
        idempotencyKey: channelImportKey,
        actor: createChannelImportActor(reservation.tenantId),
        writeAudit: false,
      },
    });
  }
}
