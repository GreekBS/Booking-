import type { Hold } from "../booking/domain/Hold";
import type { Quote } from "../booking/domain/Quote";
import type { Booking } from "../booking/domain/Booking";
import type {
  ActiveCalendarBlock,
  CalendarBlockView,
  OperatorBlockType,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../shared/types/CommerceTypes";

export interface CatalogUnitReadModel {
  id: string;
  tenantId: string;
  propertyId: string;
  maxGuests: number;
  status: string;
}

export interface CatalogPropertyReadModel {
  id: string;
  tenantId: string;
  timezone: string;
  status: string;
}

export interface ICatalogQueryPort {
  getUnit(unitId: string, tenantId: string): Promise<CatalogUnitReadModel | null>;
  getProperty(propertyId: string, tenantId: string): Promise<CatalogPropertyReadModel | null>;
}

export interface CalendarDateRange {
  from: string;
  to: string;
}

export interface IHoldRepository {
  save(hold: Hold): Promise<void>;
  findById(id: string, tenantId: string): Promise<Hold | null>;
  findActiveByUnitAndPeriod(
    unitId: string,
    tenantId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<Hold | null>;
  findActiveByUnit(unitId: string, tenantId: string, range?: CalendarDateRange): Promise<Hold[]>;
  findActiveByTenant(tenantId: string, filters?: HoldListFilters): Promise<Hold[]>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Hold | null>;
  findExpiredActive(before: Date, limit: number): Promise<Hold[]>;
}

export interface HoldListFilters {
  unitId?: string;
  propertyId?: string;
  allowedPropertyIds?: string[] | null;
}

export interface IQuoteRepository {
  save(quote: Quote): Promise<void>;
  findById(id: string, tenantId: string): Promise<Quote | null>;
}

export interface IBookingRepository {
  save(booking: Booking): Promise<void>;
  findById(id: string, tenantId: string): Promise<Booking | null>;
  findByUnit(unitId: string, tenantId: string, range?: CalendarDateRange): Promise<Booking[]>;
  search(filters: BookingSearchFilters): Promise<PaginatedBookings>;
}

export type BookingSortField = "checkIn" | "checkOut" | "guestName" | "status" | "createdAt";

export interface BookingSearchFilters {
  tenantId: string;
  unitId?: string;
  propertyId?: string;
  status?: string;
  checkInFrom?: string;
  checkInTo?: string;
  checkOutFrom?: string;
  checkOutTo?: string;
  guestSearch?: string;
  allowedPropertyIds?: string[] | null;
  page: number;
  limit: number;
  sortBy: BookingSortField;
  sortDir: "asc" | "desc";
}

export interface PaginatedBookings {
  data: Booking[];
  total: number;
  page: number;
  limit: number;
}

export interface CommerceSettingsReadModel {
  tenantId: string;
  defaultHoldTtlSeconds: number;
  confirmationMode: "manual" | "payment_required";
  defaultCurrency: string;
}

export interface ICommerceSettingsRepository {
  findByTenantId(tenantId: string): Promise<CommerceSettingsReadModel | null>;
  update(
    tenantId: string,
    data: Partial<Omit<CommerceSettingsReadModel, "tenantId">>,
  ): Promise<CommerceSettingsReadModel>;
}

export interface ICalendarBlockRepository {
  findActiveBlocks(unitId: string, tenantId: string): Promise<ActiveCalendarBlock[]>;
  findById(id: string, tenantId: string): Promise<CalendarBlockView | null>;
  findCalendarBlocks(
    unitId: string,
    tenantId: string,
    range?: CalendarDateRange,
  ): Promise<CalendarBlockView[]>;
  saveOperatorBlock(params: {
    id: string;
    tenantId: string;
    unitId: string;
    propertyId: string;
    blockType: OperatorBlockType;
    checkIn: string;
    checkOut: string;
    reason?: string | null;
  }): Promise<void>;
  releaseBlock(id: string, tenantId: string): Promise<void>;
}

export interface IRatePlanRepository {
  findByUnitId(unitId: string, tenantId: string): Promise<RatePlanProps | null>;
  save(tenantId: string, unitId: string, plan: RatePlanProps): Promise<void>;
}

export interface IAvailabilityRulesRepository {
  findByUnitId(unitId: string, tenantId: string): Promise<UnitAvailabilityRulesProps | null>;
  save(tenantId: string, unitId: string, rules: UnitAvailabilityRulesProps): Promise<void>;
}

export interface ICommerceFlowRepository {
  saveHoldAndBooking(hold: Hold, booking: Booking): Promise<void>;
  saveImportReservation(hold: Hold, quote: Quote, booking: Booking): Promise<void>;
  saveStayChange(quote: Quote, booking: Booking): Promise<void>;
}

export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string | null;
  status: string;
}

export interface IPaymentGateway {
  createIntent(params: {
    amount: string;
    currency: string;
    bookingId: string;
    tenantId: string;
  }): Promise<PaymentIntentResult>;
  capture(intentId: string): Promise<PaymentIntentResult>;
  cancelIntent(intentId: string): Promise<void>;
}

export interface ITimezoneService {
  propertyLocalToday(timezone: string, at?: Date): Promise<string>;
}
