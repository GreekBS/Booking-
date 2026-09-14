// Intentional ADR-022 transport violation — must fail ChannelArchitectureFitness negative assertions.
import { ImportChannelReservationCommandUseCase } from "../../src/channels/application/ImportChannelReservationCommandUseCase";

export const forbiddenTransportImport = ImportChannelReservationCommandUseCase;
