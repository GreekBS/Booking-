// Intentional provider adapter violation — must fail architecture fitness scans.
import { CreateReservationUseCase } from "../../src/commerce/application/CreateReservationUseCase";

export const forbiddenProviderAdapterImport = CreateReservationUseCase;
