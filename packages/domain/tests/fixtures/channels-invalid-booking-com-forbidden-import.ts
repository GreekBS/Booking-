// Intentional Booking.com provider boundary violation — must fail CM-4c-1 fitness scans.
import { PrepareReservationUseCase } from "../../src/commerce/application/PrepareReservationUseCase";
import { ReservationOrchestrator } from "../../src/commerce/reservation/ReservationOrchestrator";

export const forbiddenBookingComProviderImports = {
  PrepareReservationUseCase,
  ReservationOrchestrator,
};
