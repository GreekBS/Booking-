import {

  CreateTenantUseCase,

  SuspendTenantUseCase,

  ActivateTenantUseCase,

  UpdateTenantUseCase,

  ListTenantsUseCase,

  GetTenantUseCase,

  GetPlatformOverviewUseCase,

  ListPlatformPropertiesUseCase,

  ListPlatformUsersUseCase,

  GetPlatformTenantDetailUseCase,

  ListPlatformChannelsUseCase,

  GetPlatformChannelDetailUseCase,

  ListPlatformJobsUseCase,

  ListPlatformInboxUseCase,

  ListPlatformOutboxUseCase,

  GetPlatformOperationsHealthUseCase,

  ListPlatformAuditLogsUseCase,

  GetPlatformSystemConfigurationUseCase,

  CreatePropertyUseCase,

  UpdatePropertyUseCase,

  ArchivePropertyUseCase,

  GetPropertyUseCase,

  ListPropertiesUseCase,

  ListPropertyUnitCatalogUseCase,

  AddUnitUseCase,

  UpdateUnitUseCase,

  RemoveUnitUseCase,

  GetUnitUseCase,

  ListAmenitiesUseCase,

  CreateAmenityUseCase,

  InviteMemberUseCase,

  AcceptInvitationUseCase,

  ListMembersUseCase,

  UpdateMemberUseCase,

  RevokeMemberUseCase,

  ResolveTenantContextUseCase,

  GetMeUseCase,

  ImpersonateTenantUseCase,

  RegisterUserUseCase,

  RequestPasswordResetUseCase,

  ResetPasswordUseCase,

  VerifyEmailUseCase,

  ChangePlatformSuperAdminRoleUseCase,

  CreateLeadUseCase,

  RequestLeadDemoUseCase,

  ListLeadsUseCase,

  GetLeadUseCase,

  UpdateLeadStatusUseCase,

  PermissionChecker,

  CheckAvailabilityUseCase,

  CreateManualBlockUseCase,

  DeleteManualBlockUseCase,

  CreateHoldUseCase,

  ReleaseHoldUseCase,

  ExpireHoldsUseCase,

  CreateQuoteUseCase,

  CreateBookingUseCase,

  ConfirmBookingUseCase,

  CancelBookingUseCase,

  GetUnitCalendarUseCase,

  GetUnitsCalendarBatchUseCase,

  GetUnitsRatePlansBatchUseCase,

  GetUnitsAvailabilityRulesBatchUseCase,

  ConfigureAvailabilityRulesUseCase,

  ConfigureRatePlanUseCase,

  GetAvailabilityRulesUseCase,

  GetRatePlanUseCase,
  PreviewStayPricingUseCase,
  ResolveOrCreateGuest,
  GetGuestUseCase,
  GetGuestProfileUseCase,
  ListGuestsUseCase,
  ListGuestReservationsUseCase,
  SearchGuestsForBookingUseCase,
  GetGuestForBookingSelectionUseCase,
  CreateGuestUseCase,
  UpdateGuestUseCase,
  ListGuestNotesUseCase,
  AddGuestNoteUseCase,
  ListGuestTagsUseCase,
  CreateGuestTagUseCase,
  AssignGuestTagUseCase,
  UnassignGuestTagUseCase,
  LinkBookingToGuestUseCase,

  GetQuoteUseCase,

  ListBookingsUseCase,

  GetBookingUseCase,

  OpenPrimaryFolioFromBookingUseCase,

  ListFoliosForBookingUseCase,

  GetFolioUseCase,

  EvaluateAndPostFolioTaxesUseCase,

  UpsertBusinessFiscalProfileUseCase,

  ListBusinessFiscalProfilesUseCase,

  UpsertCustomerBillingProfileUseCase,

  ListCustomerBillingProfilesUseCase,

  CreateFiscalSeriesUseCase,

  ListFiscalSeriesUseCase,

  SetFiscalSeriesActiveUseCase,

  CreateFiscalDocumentDraftUseCase,

  IssueFiscalDocumentUseCase,

  GetFiscalDocumentUseCase,

  ListFiscalDocumentsUseCase,

  GetFolioFiscalCoverageUseCase,

  CreateCreditFiscalDocumentDraftUseCase,

  RecordManualPaymentUseCase,

  GetPaymentUseCase,

  ListPaymentsUseCase,

  AllocatePaymentUseCase,

  ReversePaymentAllocationUseCase,

  CreateRefundUseCase,

  GetFolioSettlementUseCase,

  GetPublicPropertyBySlugUseCase,

  GetTenantSettingsUseCase,

  UpdateTenantSettingsUseCase,

  GetCommerceSettingsUseCase,

  UpdateCommerceSettingsUseCase,

  ListPublishableKeysUseCase,

  CreatePublishableKeyUseCase,

  RevokePublishableKeyUseCase,

  UpdatePublishableKeyDomainsUseCase,

  SearchBookingsUseCase,

  GetTenantDashboardOverviewUseCase,

  ListHoldsUseCase,

  GetHoldUseCase,

  ResendInvitationUseCase,

  ListPendingInvitationsUseCase,

  ReservationOrchestrator,

  ChangeBookingStayUseCase,

  ProcessOutboxBatchUseCase,

  OutboxHandlerRegistry,

  LoggingHandler,

  ProcessJobBatchUseCase,

  JobHandlerRegistry,

  LoggingJobHandler,

  EnqueueJobUseCase,

  ExpireHoldsJobHandler,

  PrepareReservationUseCase,

  ImportChannelReservationCreateDryRunUseCase,

  ImportChannelReservationCommandUseCase,

  ImportChannelReservationModifyDryRunUseCase,

  ImportChannelReservationModifyCommandUseCase,

  ImportChannelReservationCancelDryRunUseCase,

  ImportChannelReservationCancelCommandUseCase,

  ReceiveChannelEventUseCase,

  ProcessChannelInboxItemUseCase,

  ReplayChannelInboxItemUseCase,

  ProcessChannelInboxJobHandler,

  ChannelIngressBatchProcessor,

  ReceiveChannelWebhookBatchUseCase,

  ReceiveChannelPollBatchUseCase,

  HandleChannelWebhookTransportUseCase,

  ExecuteChannelPollConnectionUseCase,

  PollChannelConnectionJobHandler,

  POLL_CHANNEL_CONNECTION_JOB_TYPE,

  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,

  SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,

  ReconcileIcalImportedInventoryUseCase,

  ReconcileIcalImportedInventoryJobHandler,

  IcalInventoryReconcileOutboxHandler,

  BookingComAriPushOutboxHandler,

  RequestBookingComAriPropagationUseCase,

  PropagateChannelUnitSyncUseCase,

  ChannelUnitSyncOutboxHandler,

  ExecuteBookingComAriPushUseCase,

  PushBookingComAriJobHandler,

  PUSH_BOOKING_COM_ARI_JOB_TYPE,

  BookingComAriClientNotConfigured,

  SweepPendingIcalInventoryReconcileUseCase,

  SweepPendingIcalInventoryReconcileJobHandler,

  ForceRedrivePendingIcalInventoryReconcileUseCase,

  ScheduleIcalPollsUseCase,

  GetChannelConnectionHealthUseCase,

  DeactivateChannelConnectionInventoryUseCase,

  EnableChannelConnectionInventoryApplyUseCase,

  DisableChannelConnectionInventoryApplyUseCase,

  RotateIcalConnectionCredentialsUseCase,

  UpsertChannelListingMappingUseCase,

  DeactivateChannelListingMappingUseCase,

  EnqueueChannelConnectionPollUseCase,

  ReplayChannelConnectionInboxItemUseCase,

  SetChannelConnectionSemanticModeUseCase,

  GetChannelConnectionSemanticConfigurationUseCase,

  CreateChannelConnectionUseCase,

  ListChannelConnectionsUseCase,

  GetChannelConnectionUseCase,

  UpdateChannelConnectionMetadataUseCase,

  PutChannelConnectionCredentialsUseCase,

  PutChannelConnectionWebhookVerificationUseCase,

  ActivateChannelConnectionUseCase,

  BookingComActivationGate,

  ResumeChannelConnectionUseCase,

  PauseChannelConnectionUseCase,

  DisconnectChannelConnectionUseCase,

  UpsertChannelProductMappingUseCase,

  ListChannelProductMappingsUseCase,

  ValidateBookingComMappingsUseCase,

  DiscoverBookingComRemoteConfigUseCase,

  GenerateBookingComInitialSyncPreviewUseCase,

  ConfirmBookingComInitialSyncUseCase,

  ReconcileBookingComConnectionUseCase,

  BookingComSummaryRecoveryUseCase,

  BookingComReservationsClientNotConfigured,

  BookingComRemoteDiscoveryClientNotConfigured,

  BookingComRemoteAriReaderNotConfigured,

  FakeBookingComRemoteDiscoveryClient,

  FakeBookingComRemoteAriReader,

  defaultFixtureSnapshot,

} from "@hcp/domain";

import { isBookingComFixtureTransportEnabled } from "@/lib/channels/booking-com-operator-access";

import {

  PrismaOutboxRepository,

  PrismaBackgroundJobRepository,

  PrismaJobScheduler,

  PrismaTenantRepository,

  PrismaPropertyRepository,

  PrismaTenantDashboardOverviewQuery,

  PrismaUserRepository,

  PrismaPlatformSuperAdminMutation,

  PrismaMembershipRepository,

  PrismaInvitationRepository,

  PrismaAuditLogRepository,

  PrismaLeadRepository,

  PrismaPlatformDirectoryRepository,

  PrismaPlatformOperationsRepository,

  PrismaPlatformAuditRepository,

  PrismaAmenityRepository,

  PrismaSessionRepository,

  UuidIdGenerator,

  PrismaVerificationTokenRepository,

  generateSecureToken,

  hashToken,

  generateInviteToken,

  PrismaHoldRepository,

  PrismaQuoteRepository,

  PrismaBookingRepository,

  PrismaFolioRepository,

  PrismaTaxRuleRepository,

  PrismaBusinessFiscalProfileRepository,

  PrismaCustomerBillingProfileRepository,

  PrismaGuestRepository,
  PrismaGuestNoteRepository,
  PrismaGuestTagRepository,

  PrismaFiscalSeriesRepository,

  PrismaFiscalDocumentRepository,

  PrismaFiscalAllocationRepository,

  PrismaPaymentRepository,

  PrismaPaymentSettlementRepository,

  PrismaCalendarBlockRepository,

  PrismaRatePlanRepository,

  PrismaAvailabilityRulesRepository,

  PrismaCommerceFlowRepository,

  PrismaCatalogQueryAdapter,

  PrismaStorefrontCatalogAdapter,

  PrismaStorefrontIdempotencyRepository,

  PrismaPublishableKeyRepository,

  PrismaCommerceSettingsRepository,

  generatePublishableKey,

  TimezoneService,

  PrismaChannelConnectionRepository,

  PrismaChannelConnectionPropertyRelevanceReader,

  PrismaChannelListingMappingRepository,

  PrismaExternalReservationLinkRepository,

  PrismaChannelReservationImportPersistence,

  PrismaChannelInboxRepository,

  PrismaChannelSemanticModeTransitionStore,

  PrismaChannelCredentialVault,

  PrismaChannelConnectionLifecycleUnitOfWork,

  PrismaChannelPollCursorRepository,

  PrismaChannelListingMappingWriteStore,

  PrismaChannelPollInventoryCommitStore,

  PrismaChannelInventoryReconciliationApplyStore,

  PrismaPendingIcalInventoryReconciliationReader,

  PrismaIcalInventoryReconcileJobQuery,

  PrismaIcalCredentialRotationStore,

  PrismaIcalChannelMappingLifecycleStore,

  PrismaChannelConnectionStatusFinder,

  PrismaChannelPollJobQuery,

  PrismaEligibleIcalPollConnectionReader,

  PrismaChannelAriPushLedger,

  PrismaChannelProductMappingRepository,

  PrismaChannelConnectionProviderSetupRepository,

  PrismaChannelInitialSyncPreviewRepository,

  PrismaChannelReconciliationRunRepository,

  PrismaChannelConnectionHealthQuery,

  PrismaDeactivateChannelConnectionInventoryStore,

  PrismaChannelImportedInventoryCleanupStore,

  PrismaChannelConnectionInventoryApplyStore,

} from "@hcp/database";

import { BcryptPasswordHasher } from "@/lib/auth/BcryptPasswordHasher";
import { stubInvitationNotifier } from "@/lib/notifications/stubInvitationNotifier";
import { createProductionChannelProviderRegistry } from "@/lib/channels/enabled-providers";
import { PollingFeatureGatedPollJobHandler } from "@/lib/channels/PollingFeatureGatedPollJobHandler";
import { isChannelsPollingEnabled } from "@/lib/channels/polling-enabled";




const outboxRepository = new PrismaOutboxRepository();

const idGenerator = new UuidIdGenerator();

const passwordHasher = new BcryptPasswordHasher();

const verificationTokenRepository = new PrismaVerificationTokenRepository();



const tenantRepository = new PrismaTenantRepository(outboxRepository);

const propertyRepository = new PrismaPropertyRepository(outboxRepository);

const userRepository = new PrismaUserRepository();

/** Exported for request-time authoritative platformRole hydration (Phase F.1). */
export { userRepository };

const platformSuperAdminMutation = new PrismaPlatformSuperAdminMutation();

const membershipRepository = new PrismaMembershipRepository(outboxRepository);

const invitationRepository = new PrismaInvitationRepository(outboxRepository);

export const auditLogRepository = new PrismaAuditLogRepository();

const amenityRepository = new PrismaAmenityRepository();

const sessionRepository = new PrismaSessionRepository();

const permissionChecker = new PermissionChecker();



export const createTenantUseCase = new CreateTenantUseCase(

  tenantRepository,

  userRepository,

  membershipRepository,

  invitationRepository,

  auditLogRepository,

  idGenerator,

  generateInviteToken,

);

export const suspendTenantUseCase = new SuspendTenantUseCase(

  tenantRepository,

  auditLogRepository,

);

export const activateTenantUseCase = new ActivateTenantUseCase(

  tenantRepository,

  auditLogRepository,

);

export const updateTenantUseCase = new UpdateTenantUseCase(

  tenantRepository,

  auditLogRepository,

);

export const listTenantsUseCase = new ListTenantsUseCase(tenantRepository);

export const getTenantUseCase = new GetTenantUseCase(tenantRepository);



export const createPropertyUseCase = new CreatePropertyUseCase(

  propertyRepository,

  permissionChecker,

  idGenerator,

);

export const updatePropertyUseCase = new UpdatePropertyUseCase(

  propertyRepository,

  permissionChecker,

);

export const archivePropertyUseCase = new ArchivePropertyUseCase(

  propertyRepository,

  permissionChecker,

);

export const getPropertyUseCase = new GetPropertyUseCase(

  propertyRepository,

  permissionChecker,

);

export const listPropertiesUseCase = new ListPropertiesUseCase(

  propertyRepository,

  permissionChecker,

);

export const listPropertyUnitCatalogUseCase = new ListPropertyUnitCatalogUseCase(

  propertyRepository,

  permissionChecker,

);



export const addUnitUseCase = new AddUnitUseCase(

  propertyRepository,

  permissionChecker,

  idGenerator,

);

export const updateUnitUseCase = new UpdateUnitUseCase(

  propertyRepository,

  permissionChecker,

);

export const removeUnitUseCase = new RemoveUnitUseCase(

  propertyRepository,

  permissionChecker,

);

export const getUnitUseCase = new GetUnitUseCase(

  propertyRepository,

  permissionChecker,

);



export const listAmenitiesUseCase = new ListAmenitiesUseCase(

  amenityRepository,

  permissionChecker,

);

export const createAmenityUseCase = new CreateAmenityUseCase(

  amenityRepository,

  permissionChecker,

);



export const inviteMemberUseCase = new InviteMemberUseCase(

  userRepository,

  membershipRepository,

  invitationRepository,

  permissionChecker,

  idGenerator,

  stubInvitationNotifier,

);

export const acceptInvitationUseCase = new AcceptInvitationUseCase(

  userRepository,

  membershipRepository,

  invitationRepository,

  idGenerator,

);

export const listMembersUseCase = new ListMembersUseCase(

  membershipRepository,

  userRepository,

  permissionChecker,

);

export const updateMemberUseCase = new UpdateMemberUseCase(

  membershipRepository,

  permissionChecker,

  auditLogRepository,

);

export const revokeMemberUseCase = new RevokeMemberUseCase(

  membershipRepository,

  permissionChecker,

  auditLogRepository,

);



export const resolveTenantContextUseCase = new ResolveTenantContextUseCase(
  userRepository,
  tenantRepository,
  membershipRepository,
);

export const getMeUseCase = new GetMeUseCase(

  userRepository,

  membershipRepository,

  tenantRepository,

);

export const impersonateTenantUseCase = new ImpersonateTenantUseCase(

  tenantRepository,

  sessionRepository,

  auditLogRepository,

);



export const registerUserUseCase = new RegisterUserUseCase(

  userRepository,

  passwordHasher,

  verificationTokenRepository,

  idGenerator,

  generateSecureToken,

);

const leadRepository = new PrismaLeadRepository();

const platformDirectoryRepository = new PrismaPlatformDirectoryRepository();

const platformOperationsRepository = new PrismaPlatformOperationsRepository();

const platformAuditRepository = new PrismaPlatformAuditRepository();

export const createLeadUseCase = new CreateLeadUseCase(

  leadRepository,

  idGenerator,

);

export const requestLeadDemoUseCase = new RequestLeadDemoUseCase(leadRepository);

export const listLeadsUseCase = new ListLeadsUseCase(leadRepository);

export const getLeadUseCase = new GetLeadUseCase(leadRepository);

export const updateLeadStatusUseCase = new UpdateLeadStatusUseCase(leadRepository);

export const getPlatformOverviewUseCase = new GetPlatformOverviewUseCase(
  tenantRepository,
  leadRepository,
  platformDirectoryRepository,
  platformOperationsRepository,
);

export const listPlatformPropertiesUseCase = new ListPlatformPropertiesUseCase(
  platformDirectoryRepository,
);

export const listPlatformUsersUseCase = new ListPlatformUsersUseCase(
  platformDirectoryRepository,
);

export const getPlatformTenantDetailUseCase = new GetPlatformTenantDetailUseCase(
  platformDirectoryRepository,
);

export const listPlatformChannelsUseCase = new ListPlatformChannelsUseCase(
  platformOperationsRepository,
);

export const getPlatformChannelDetailUseCase = new GetPlatformChannelDetailUseCase(
  platformOperationsRepository,
);

export const listPlatformJobsUseCase = new ListPlatformJobsUseCase(
  platformOperationsRepository,
);

export const listPlatformInboxUseCase = new ListPlatformInboxUseCase(
  platformOperationsRepository,
);

export const listPlatformOutboxUseCase = new ListPlatformOutboxUseCase(
  platformOperationsRepository,
);

export const getPlatformOperationsHealthUseCase =
  new GetPlatformOperationsHealthUseCase(platformOperationsRepository);

export const listPlatformAuditLogsUseCase = new ListPlatformAuditLogsUseCase(
  platformAuditRepository,
);

export const getPlatformSystemConfigurationUseCase =
  new GetPlatformSystemConfigurationUseCase(platformAuditRepository);

export const requestPasswordResetUseCase = new RequestPasswordResetUseCase(

  userRepository,

  verificationTokenRepository,

  generateSecureToken,

);

export const resetPasswordUseCase = new ResetPasswordUseCase(

  userRepository,

  verificationTokenRepository,

  passwordHasher,

);

export const verifyEmailUseCase = new VerifyEmailUseCase(

  userRepository,

  verificationTokenRepository,

);

/** Explicit platform SA promote/demote — protected mutation boundary. */
export const changePlatformSuperAdminRoleUseCase =
  new ChangePlatformSuperAdminRoleUseCase(platformSuperAdminMutation);

const catalogQueryAdapter = new PrismaCatalogQueryAdapter();

const holdRepository = new PrismaHoldRepository(outboxRepository);

const quoteRepository = new PrismaQuoteRepository(outboxRepository);

const bookingRepository = new PrismaBookingRepository(outboxRepository);

const folioRepository = new PrismaFolioRepository();

const taxRuleRepository = new PrismaTaxRuleRepository();

const businessFiscalProfileRepository = new PrismaBusinessFiscalProfileRepository();

const customerBillingProfileRepository = new PrismaCustomerBillingProfileRepository();

const guestRepository = new PrismaGuestRepository();
const guestNoteRepository = new PrismaGuestNoteRepository();
const guestTagRepository = new PrismaGuestTagRepository();

const fiscalSeriesRepository = new PrismaFiscalSeriesRepository();

const fiscalDocumentRepository = new PrismaFiscalDocumentRepository();

const fiscalAllocationRepository = new PrismaFiscalAllocationRepository();

const paymentRepository = new PrismaPaymentRepository();

const paymentSettlementRepository = new PrismaPaymentSettlementRepository();

const calendarBlockRepository = new PrismaCalendarBlockRepository();
export { calendarBlockRepository };

const ratePlanRepository = new PrismaRatePlanRepository();
export { ratePlanRepository };

const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
export { availabilityRulesRepository };

const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);

const timezoneService = new TimezoneService();

const storefrontCatalogAdapter = new PrismaStorefrontCatalogAdapter();

export const storefrontIdempotencyRepository = new PrismaStorefrontIdempotencyRepository();

export const publishableKeyRepository = new PrismaPublishableKeyRepository();

const commerceSettingsRepository = new PrismaCommerceSettingsRepository();

export { holdRepository, quoteRepository, bookingRepository, storefrontCatalogAdapter };

export const getPublicPropertyBySlugUseCase = new GetPublicPropertyBySlugUseCase(
  storefrontCatalogAdapter,
);

export const reservationOrchestrator = new ReservationOrchestrator(
  catalogQueryAdapter,
  calendarBlockRepository,
  availabilityRulesRepository,
  ratePlanRepository,
  timezoneService,
  idGenerator,
);

export const checkAvailabilityUseCase = new CheckAvailabilityUseCase(
  catalogQueryAdapter,
  reservationOrchestrator,
  permissionChecker,
);

export const changeBookingStayUseCase = new ChangeBookingStayUseCase(
  bookingRepository,
  quoteRepository,
  commerceFlowRepository,
  reservationOrchestrator,
  permissionChecker,
  auditLogRepository,
);

export const createManualBlockUseCase = new CreateManualBlockUseCase(

  catalogQueryAdapter,

  calendarBlockRepository,

  permissionChecker,

  idGenerator,

  outboxRepository,

);



export const deleteManualBlockUseCase = new DeleteManualBlockUseCase(

  catalogQueryAdapter,

  calendarBlockRepository,

  permissionChecker,

  outboxRepository,

);



export const createHoldUseCase = new CreateHoldUseCase(
  holdRepository,
  reservationOrchestrator,
  permissionChecker,
  idGenerator,
);



export const releaseHoldUseCase = new ReleaseHoldUseCase(

  holdRepository,

  permissionChecker,

);



export const expireHoldsUseCase = new ExpireHoldsUseCase(holdRepository);



export const createQuoteUseCase = new CreateQuoteUseCase(
  catalogQueryAdapter,
  holdRepository,
  quoteRepository,
  reservationOrchestrator,
  permissionChecker,
  idGenerator,
);



export const previewStayPricingUseCase = new PreviewStayPricingUseCase(
  catalogQueryAdapter,
  reservationOrchestrator,
  permissionChecker,
);

export const resolveOrCreateGuest = new ResolveOrCreateGuest(
  guestRepository,
  idGenerator,
  permissionChecker,
);

export const getGuestUseCase = new GetGuestUseCase(
  guestRepository,
  permissionChecker,
);

export const getGuestProfileUseCase = new GetGuestProfileUseCase(
  guestRepository,
  guestTagRepository,
  permissionChecker,
);

export const listGuestsUseCase = new ListGuestsUseCase(
  guestRepository,
  permissionChecker,
);

export const listGuestReservationsUseCase = new ListGuestReservationsUseCase(
  guestRepository,
  permissionChecker,
);

export const searchGuestsForBookingUseCase = new SearchGuestsForBookingUseCase(
  guestRepository,
  permissionChecker,
);

export const getGuestForBookingSelectionUseCase =
  new GetGuestForBookingSelectionUseCase(guestRepository, permissionChecker);

export const createGuestUseCase = new CreateGuestUseCase(
  guestRepository,
  idGenerator,
  permissionChecker,
);

export const updateGuestUseCase = new UpdateGuestUseCase(
  guestRepository,
  permissionChecker,
  auditLogRepository,
);

export const listGuestNotesUseCase = new ListGuestNotesUseCase(
  guestRepository,
  guestNoteRepository,
  permissionChecker,
);

export const addGuestNoteUseCase = new AddGuestNoteUseCase(
  guestRepository,
  guestNoteRepository,
  idGenerator,
  permissionChecker,
);

export const listGuestTagsUseCase = new ListGuestTagsUseCase(
  guestTagRepository,
  permissionChecker,
);

export const createGuestTagUseCase = new CreateGuestTagUseCase(
  guestTagRepository,
  idGenerator,
  permissionChecker,
);

export const assignGuestTagUseCase = new AssignGuestTagUseCase(
  guestRepository,
  guestTagRepository,
  idGenerator,
  permissionChecker,
);

export const unassignGuestTagUseCase = new UnassignGuestTagUseCase(
  guestRepository,
  guestTagRepository,
  permissionChecker,
);

export const linkBookingToGuestUseCase = new LinkBookingToGuestUseCase(
  bookingRepository,
  guestRepository,
  permissionChecker,
);

export const createBookingUseCase = new CreateBookingUseCase(
  holdRepository,
  quoteRepository,
  commerceFlowRepository,
  permissionChecker,
  auditLogRepository,
  idGenerator,
  resolveOrCreateGuest,
  guestRepository,
);



export const confirmBookingUseCase = new ConfirmBookingUseCase(

  bookingRepository,

  permissionChecker,

  auditLogRepository,

);



export const cancelBookingUseCase = new CancelBookingUseCase(

  bookingRepository,

  permissionChecker,

  auditLogRepository,

);



export const getUnitCalendarUseCase = new GetUnitCalendarUseCase(

  catalogQueryAdapter,

  calendarBlockRepository,

  holdRepository,

  bookingRepository,

  permissionChecker,

);

export const getUnitsCalendarBatchUseCase = new GetUnitsCalendarBatchUseCase(

  catalogQueryAdapter,

  calendarBlockRepository,

  holdRepository,

  bookingRepository,

  permissionChecker,

);

export const getUnitsRatePlansBatchUseCase = new GetUnitsRatePlansBatchUseCase(

  catalogQueryAdapter,

  ratePlanRepository,

  permissionChecker,

);

export const getUnitsAvailabilityRulesBatchUseCase = new GetUnitsAvailabilityRulesBatchUseCase(

  catalogQueryAdapter,

  availabilityRulesRepository,

  permissionChecker,

);



export const configureAvailabilityRulesUseCase = new ConfigureAvailabilityRulesUseCase(

  catalogQueryAdapter,

  availabilityRulesRepository,

  permissionChecker,

  outboxRepository,

);



export const configureRatePlanUseCase = new ConfigureRatePlanUseCase(

  catalogQueryAdapter,

  ratePlanRepository,

  permissionChecker,

  outboxRepository,

);



export const getAvailabilityRulesUseCase = new GetAvailabilityRulesUseCase(

  catalogQueryAdapter,

  availabilityRulesRepository,

  permissionChecker,

);



export const getRatePlanUseCase = new GetRatePlanUseCase(

  catalogQueryAdapter,

  ratePlanRepository,

  permissionChecker,

);



export const getQuoteUseCase = new GetQuoteUseCase(

  quoteRepository,

  permissionChecker,

);



export const listBookingsUseCase = new ListBookingsUseCase(

  catalogQueryAdapter,

  bookingRepository,

  permissionChecker,

);



export const getBookingUseCase = new GetBookingUseCase(

  bookingRepository,

  permissionChecker,

);

export const openPrimaryFolioFromBookingUseCase = new OpenPrimaryFolioFromBookingUseCase(
  bookingRepository,
  quoteRepository,
  folioRepository,
  idGenerator,
  permissionChecker,
  paymentSettlementRepository,
);

export const listFoliosForBookingUseCase = new ListFoliosForBookingUseCase(
  bookingRepository,
  folioRepository,
  permissionChecker,
  paymentSettlementRepository,
);

export const getFolioUseCase = new GetFolioUseCase(
  bookingRepository,
  folioRepository,
  permissionChecker,
  paymentSettlementRepository,
);

export const recordManualPaymentUseCase = new RecordManualPaymentUseCase(
  bookingRepository,
  paymentRepository,
  paymentSettlementRepository,
  idGenerator,
  permissionChecker,
);

export const getPaymentUseCase = new GetPaymentUseCase(
  paymentRepository,
  permissionChecker,
);

export const listPaymentsUseCase = new ListPaymentsUseCase(
  paymentRepository,
  permissionChecker,
);

export const allocatePaymentUseCase = new AllocatePaymentUseCase(
  folioRepository,
  bookingRepository,
  paymentSettlementRepository,
  idGenerator,
  permissionChecker,
);

export const reversePaymentAllocationUseCase = new ReversePaymentAllocationUseCase(
  paymentSettlementRepository,
  idGenerator,
  permissionChecker,
);

export const createRefundUseCase = new CreateRefundUseCase(
  paymentSettlementRepository,
  idGenerator,
  permissionChecker,
);

export const getFolioSettlementUseCase = new GetFolioSettlementUseCase(
  bookingRepository,
  folioRepository,
  paymentSettlementRepository,
  permissionChecker,
);

export const evaluateAndPostFolioTaxesUseCase = new EvaluateAndPostFolioTaxesUseCase(
  bookingRepository,
  folioRepository,
  businessFiscalProfileRepository,
  taxRuleRepository,
  idGenerator,
  permissionChecker,
);

export const upsertBusinessFiscalProfileUseCase = new UpsertBusinessFiscalProfileUseCase(
  businessFiscalProfileRepository,
  idGenerator,
  permissionChecker,
);

export const listBusinessFiscalProfilesUseCase = new ListBusinessFiscalProfilesUseCase(
  businessFiscalProfileRepository,
  permissionChecker,
);

export const upsertCustomerBillingProfileUseCase = new UpsertCustomerBillingProfileUseCase(
  customerBillingProfileRepository,
  idGenerator,
  permissionChecker,
);

export const listCustomerBillingProfilesUseCase = new ListCustomerBillingProfilesUseCase(
  customerBillingProfileRepository,
  permissionChecker,
);

export const createFiscalSeriesUseCase = new CreateFiscalSeriesUseCase(
  fiscalSeriesRepository,
  idGenerator,
  permissionChecker,
  auditLogRepository,
);

export const listFiscalSeriesUseCase = new ListFiscalSeriesUseCase(
  fiscalSeriesRepository,
  permissionChecker,
);

export const setFiscalSeriesActiveUseCase = new SetFiscalSeriesActiveUseCase(
  fiscalSeriesRepository,
  permissionChecker,
  auditLogRepository,
);

export const createFiscalDocumentDraftUseCase = new CreateFiscalDocumentDraftUseCase(
  fiscalDocumentRepository,
  fiscalSeriesRepository,
  fiscalAllocationRepository,
  folioRepository,
  bookingRepository,
  businessFiscalProfileRepository,
  customerBillingProfileRepository,
  idGenerator,
  permissionChecker,
  auditLogRepository,
);

export const issueFiscalDocumentUseCase = new IssueFiscalDocumentUseCase(
  fiscalDocumentRepository,
  fiscalSeriesRepository,
  fiscalAllocationRepository,
  idGenerator,
  permissionChecker,
);

export const getFiscalDocumentUseCase = new GetFiscalDocumentUseCase(
  fiscalDocumentRepository,
  permissionChecker,
);

export const listFiscalDocumentsUseCase = new ListFiscalDocumentsUseCase(
  fiscalDocumentRepository,
  permissionChecker,
);

export const getFolioFiscalCoverageUseCase = new GetFolioFiscalCoverageUseCase(
  folioRepository,
  fiscalAllocationRepository,
  bookingRepository,
  permissionChecker,
);

export const createCreditFiscalDocumentDraftUseCase =
  new CreateCreditFiscalDocumentDraftUseCase(
    fiscalDocumentRepository,
    fiscalSeriesRepository,
    idGenerator,
    permissionChecker,
    auditLogRepository,
  );

export const getTenantSettingsUseCase = new GetTenantSettingsUseCase(
  tenantRepository,
  permissionChecker,
);

export const updateTenantSettingsUseCase = new UpdateTenantSettingsUseCase(
  tenantRepository,
  permissionChecker,
  auditLogRepository,
);

export const getCommerceSettingsUseCase = new GetCommerceSettingsUseCase(
  commerceSettingsRepository,
  permissionChecker,
);

export const updateCommerceSettingsUseCase = new UpdateCommerceSettingsUseCase(
  commerceSettingsRepository,
  permissionChecker,
  auditLogRepository,
);

export const listPublishableKeysUseCase = new ListPublishableKeysUseCase(
  publishableKeyRepository,
  permissionChecker,
);

export const createPublishableKeyUseCase = new CreatePublishableKeyUseCase(
  publishableKeyRepository,
  permissionChecker,
  auditLogRepository,
  idGenerator,
);

export const revokePublishableKeyUseCase = new RevokePublishableKeyUseCase(
  publishableKeyRepository,
  permissionChecker,
  auditLogRepository,
);

export const updatePublishableKeyDomainsUseCase = new UpdatePublishableKeyDomainsUseCase(
  publishableKeyRepository,
  permissionChecker,
  auditLogRepository,
);

export const searchBookingsUseCase = new SearchBookingsUseCase(
  bookingRepository,
  permissionChecker,
);

const tenantDashboardOverviewQuery = new PrismaTenantDashboardOverviewQuery();

export const getTenantDashboardOverviewUseCase = new GetTenantDashboardOverviewUseCase(
  tenantDashboardOverviewQuery,
  permissionChecker,
);

export const listHoldsUseCase = new ListHoldsUseCase(
  holdRepository,
  permissionChecker,
);

export const getHoldUseCase = new GetHoldUseCase(
  holdRepository,
  permissionChecker,
);

export const resendInvitationUseCase = new ResendInvitationUseCase(
  invitationRepository,
  permissionChecker,
  stubInvitationNotifier,
  auditLogRepository,
);

export const listPendingInvitationsUseCase = new ListPendingInvitationsUseCase(
  invitationRepository,
  permissionChecker,
);

const outboxHandlerRegistry = new OutboxHandlerRegistry();

const backgroundJobRepository = new PrismaBackgroundJobRepository();
export const jobScheduler = new PrismaJobScheduler(backgroundJobRepository);

const jobHandlerRegistry = new JobHandlerRegistry();
jobHandlerRegistry.register(new LoggingJobHandler());
jobHandlerRegistry.register(new ExpireHoldsJobHandler(expireHoldsUseCase));

export const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);

// P1-S6b: typed reconcile outbox handler MUST register before LoggingHandler catch-all.
outboxHandlerRegistry.register(new IcalInventoryReconcileOutboxHandler(enqueueJobUseCase));
// CM-4c-3: Booking.com ARI push outbox → job bridge (before LoggingHandler).
outboxHandlerRegistry.register(new BookingComAriPushOutboxHandler(enqueueJobUseCase));
// LoggingHandler registered later after ChannelUnitSyncOutboxHandler.

export const processOutboxBatchUseCase = new ProcessOutboxBatchUseCase(
  outboxRepository,
  outboxHandlerRegistry,
);

/** CM-4b S4a-2a: one production registry; empty allow-list is valid (zero providers). */
const channelProviderRegistry = createProductionChannelProviderRegistry();
const channelConnectionRepository = new PrismaChannelConnectionRepository();
export const channelListingMappingRepository =
  new PrismaChannelListingMappingRepository();
const channelConnectionProviderSetupRepository =
  new PrismaChannelConnectionProviderSetupRepository();
const bookingComActivationGate = new BookingComActivationGate(
  channelConnectionProviderSetupRepository,
);
const externalReservationLinkRepository = new PrismaExternalReservationLinkRepository();
const channelInboxRepository = new PrismaChannelInboxRepository();
const channelImportPersistence = new PrismaChannelReservationImportPersistence(outboxRepository);

/** CM-4b S4a-2a: production poll cursor repository (CAS unchanged). */
const channelPollCursorRepository = new PrismaChannelPollCursorRepository();
/** P1-S6a: phantom-safe mapping writes + atomic inventory commit TX1. */
export const channelListingMappingWriteStore = new PrismaChannelListingMappingWriteStore();
const channelPollInventoryCommitStore = new PrismaChannelPollInventoryCommitStore();
/** P1-S6b: TX2 inventory apply. */
const channelInventoryReconciliationApplyStore =
  new PrismaChannelInventoryReconciliationApplyStore();
const pendingIcalInventoryReconciliationReader =
  new PrismaPendingIcalInventoryReconciliationReader();
const icalInventoryReconcileJobQuery = new PrismaIcalInventoryReconcileJobQuery();
/** P1-S6c: async redrive lifecycle gate (paused/rotating connections are skipped). */
const channelConnectionStatusFinder = new PrismaChannelConnectionStatusFinder();

export const reconcileIcalImportedInventoryUseCase =
  new ReconcileIcalImportedInventoryUseCase(channelInventoryReconciliationApplyStore);

export const sweepPendingIcalInventoryReconcileUseCase =
  new SweepPendingIcalInventoryReconcileUseCase(
    pendingIcalInventoryReconciliationReader,
    icalInventoryReconcileJobQuery,
    enqueueJobUseCase,
    channelConnectionStatusFinder,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

export const forceRedrivePendingIcalInventoryReconcileUseCase =
  new ForceRedrivePendingIcalInventoryReconcileUseCase(
    icalInventoryReconcileJobQuery,
    enqueueJobUseCase,
    (tenantId, connectionId, cursorVersion) =>
      pendingIcalInventoryReconciliationReader.findPending(
        tenantId,
        connectionId,
        cursorVersion,
      ),
    channelConnectionStatusFinder,
    permissionChecker,
    auditLogRepository,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

const channelSemanticModeTransitionStore = new PrismaChannelSemanticModeTransitionStore();

export const setChannelConnectionSemanticModeUseCase =
  new SetChannelConnectionSemanticModeUseCase(
    channelSemanticModeTransitionStore,
    channelConnectionRepository,
    channelProviderRegistry,
    permissionChecker,
  );

export const getChannelConnectionSemanticConfigurationUseCase =
  new GetChannelConnectionSemanticConfigurationUseCase(
    channelConnectionRepository,
    channelProviderRegistry,
    permissionChecker,
  );

/** CM-4b S4a-1: sealed credential vault (store + resolver).
 * Constructed eagerly for DI wiring; master key is parsed lazily on first
 * credential seal/unseal (fail-closed, no placeholder key).
 */
const channelCredentialVault = new PrismaChannelCredentialVault();
const channelConnectionLifecycleUnitOfWork =
  new PrismaChannelConnectionLifecycleUnitOfWork();
const channelConnectionPropertyRelevanceReader =
  new PrismaChannelConnectionPropertyRelevanceReader();

export const createChannelConnectionUseCase = new CreateChannelConnectionUseCase(
  channelConnectionRepository,
  propertyRepository,
  permissionChecker,
  idGenerator,
  auditLogRepository,
);

export const listChannelConnectionsUseCase = new ListChannelConnectionsUseCase(
  channelConnectionRepository,
  channelConnectionPropertyRelevanceReader,
  propertyRepository,
  permissionChecker,
);

export const getChannelConnectionUseCase = new GetChannelConnectionUseCase(
  channelConnectionRepository,
  channelConnectionPropertyRelevanceReader,
  permissionChecker,
);

export const updateChannelConnectionMetadataUseCase =
  new UpdateChannelConnectionMetadataUseCase(
    channelConnectionRepository,
    permissionChecker,
    auditLogRepository,
  );

export const putChannelConnectionCredentialsUseCase =
  new PutChannelConnectionCredentialsUseCase(
    channelConnectionRepository,
    channelCredentialVault,
    permissionChecker,
    auditLogRepository,
  );

export const putChannelConnectionWebhookVerificationUseCase =
  new PutChannelConnectionWebhookVerificationUseCase(
    channelConnectionRepository,
    channelCredentialVault,
    permissionChecker,
    auditLogRepository,
  );

/** P1-S6c: durable iCal credential rotation receipts + mapping lifecycle. */
const icalCredentialRotationStore = new PrismaIcalCredentialRotationStore();
const icalChannelMappingLifecycleStore = new PrismaIcalChannelMappingLifecycleStore();

export const rotateIcalConnectionCredentialsUseCase =
  new RotateIcalConnectionCredentialsUseCase(
    channelConnectionRepository,
    icalCredentialRotationStore,
    channelCredentialVault,
    permissionChecker,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

export const upsertChannelListingMappingUseCase = new UpsertChannelListingMappingUseCase(
  channelConnectionRepository,
  channelListingMappingRepository,
  icalChannelMappingLifecycleStore,
  permissionChecker,
  idGenerator,
);

export const deactivateChannelListingMappingUseCase =
  new DeactivateChannelListingMappingUseCase(
    channelConnectionRepository,
    channelListingMappingRepository,
    icalChannelMappingLifecycleStore,
    permissionChecker,
  );

export const activateChannelConnectionUseCase = new ActivateChannelConnectionUseCase(
  channelConnectionRepository,
  channelProviderRegistry,
  permissionChecker,
  channelConnectionLifecycleUnitOfWork,
  icalCredentialRotationStore,
  bookingComActivationGate,
  channelConnectionPropertyRelevanceReader,
);

export const resumeChannelConnectionUseCase = new ResumeChannelConnectionUseCase(
  channelConnectionRepository,
  channelProviderRegistry,
  permissionChecker,
  channelConnectionLifecycleUnitOfWork,
  icalCredentialRotationStore,
  channelConnectionPropertyRelevanceReader,
);

export const pauseChannelConnectionUseCase = new PauseChannelConnectionUseCase(
  channelConnectionRepository,
  permissionChecker,
  channelConnectionLifecycleUnitOfWork,
  channelConnectionPropertyRelevanceReader,
);

const channelImportedInventoryCleanupStore =
  new PrismaChannelImportedInventoryCleanupStore();

export const disconnectChannelConnectionUseCase =
  new DisconnectChannelConnectionUseCase(
    channelConnectionRepository,
    permissionChecker,
    channelConnectionLifecycleUnitOfWork,
    channelImportedInventoryCleanupStore,
    channelConnectionPropertyRelevanceReader,
  );

const prepareReservationUseCase = new PrepareReservationUseCase(
  catalogQueryAdapter,
  reservationOrchestrator,
  permissionChecker,
  idGenerator,
);

const importChannelReservationCreateDryRunUseCase = new ImportChannelReservationCreateDryRunUseCase(
  channelProviderRegistry,
  channelConnectionRepository,
  channelListingMappingRepository,
  externalReservationLinkRepository,
);

const importChannelReservationCommandUseCase = new ImportChannelReservationCommandUseCase(
  externalReservationLinkRepository,
  channelListingMappingRepository,
  prepareReservationUseCase,
  channelImportPersistence,
  idGenerator,
  resolveOrCreateGuest,
);

const importChannelReservationModifyDryRunUseCase =
  new ImportChannelReservationModifyDryRunUseCase(
    channelProviderRegistry,
    channelConnectionRepository,
    channelListingMappingRepository,
    externalReservationLinkRepository,
  );

const importChannelReservationModifyCommandUseCase =
  new ImportChannelReservationModifyCommandUseCase(
    bookingRepository,
    quoteRepository,
    commerceFlowRepository,
    reservationOrchestrator,
    externalReservationLinkRepository,
  );

const importChannelReservationCancelDryRunUseCase =
  new ImportChannelReservationCancelDryRunUseCase(
    channelProviderRegistry,
    channelConnectionRepository,
    externalReservationLinkRepository,
  );

const importChannelReservationCancelCommandUseCase =
  new ImportChannelReservationCancelCommandUseCase(
    bookingRepository,
    externalReservationLinkRepository,
  );

export const processChannelInboxItemUseCase = new ProcessChannelInboxItemUseCase(
  channelInboxRepository,
  importChannelReservationCreateDryRunUseCase,
  importChannelReservationCommandUseCase,
  idGenerator,
  importChannelReservationModifyDryRunUseCase,
  importChannelReservationModifyCommandUseCase,
  importChannelReservationCancelDryRunUseCase,
  importChannelReservationCancelCommandUseCase,
);

export const receiveChannelEventUseCase = new ReceiveChannelEventUseCase(
  channelInboxRepository,
  enqueueJobUseCase,
  idGenerator,
);

export const replayChannelInboxItemUseCase = new ReplayChannelInboxItemUseCase(
  channelInboxRepository,
  receiveChannelEventUseCase,
);

export const replayChannelConnectionInboxItemUseCase =
  new ReplayChannelConnectionInboxItemUseCase(
    channelConnectionRepository,
    channelInboxRepository,
    replayChannelInboxItemUseCase,
    permissionChecker,
  );

const channelPollJobQuery = new PrismaChannelPollJobQuery();
const eligibleIcalPollConnectionReader = new PrismaEligibleIcalPollConnectionReader();
const channelConnectionHealthQuery = new PrismaChannelConnectionHealthQuery();
const deactivateChannelConnectionInventoryStore =
  new PrismaDeactivateChannelConnectionInventoryStore();
const channelConnectionInventoryApplyStore =
  new PrismaChannelConnectionInventoryApplyStore();

export const enqueueChannelConnectionPollUseCase =
  new EnqueueChannelConnectionPollUseCase(
    channelConnectionRepository,
    channelProviderRegistry,
    enqueueJobUseCase,
    permissionChecker,
    channelPollJobQuery,
  );

/** P1-S7b — internal schedule-ical-polls (Bearer BACKGROUND_JOBS_SECRET). */
export const scheduleIcalPollsUseCase = new ScheduleIcalPollsUseCase(
  eligibleIcalPollConnectionReader,
  channelPollJobQuery,
  enqueueChannelConnectionPollUseCase,
  enqueueJobUseCase,
  channelProviderRegistry,
  () => isChannelsPollingEnabled(),
  (fields) => {
    console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
  },
);

export const getChannelConnectionHealthUseCase = new GetChannelConnectionHealthUseCase(
  channelConnectionRepository,
  channelListingMappingRepository,
  channelPollCursorRepository,
  channelPollJobQuery,
  channelConnectionHealthQuery,
  icalCredentialRotationStore,
  permissionChecker,
);

export const deactivateChannelConnectionInventoryUseCase =
  new DeactivateChannelConnectionInventoryUseCase(
    channelConnectionRepository,
    deactivateChannelConnectionInventoryStore,
    permissionChecker,
  );

export const enableChannelConnectionInventoryApplyUseCase =
  new EnableChannelConnectionInventoryApplyUseCase(
    channelConnectionRepository,
    channelListingMappingRepository,
    channelPollJobQuery,
    channelConnectionHealthQuery,
    icalCredentialRotationStore,
    channelConnectionInventoryApplyStore,
    permissionChecker,
  );

export const disableChannelConnectionInventoryApplyUseCase =
  new DisableChannelConnectionInventoryApplyUseCase(
    channelConnectionRepository,
    channelConnectionInventoryApplyStore,
    permissionChecker,
  );

/** CM-4b S4a-2a/S4a-2b: transport composition (HTTP surfaces added in S4a-2b). */
const channelIngressBatchProcessor = new ChannelIngressBatchProcessor(
  receiveChannelEventUseCase,
);

export const receiveChannelWebhookBatchUseCase = new ReceiveChannelWebhookBatchUseCase(
  channelConnectionRepository,
  channelCredentialVault,
  channelProviderRegistry,
  channelIngressBatchProcessor,
);

export const receiveChannelPollBatchUseCase = new ReceiveChannelPollBatchUseCase(
  channelConnectionRepository,
  channelCredentialVault,
  channelProviderRegistry,
  channelIngressBatchProcessor,
);

export const handleChannelWebhookTransportUseCase =
  new HandleChannelWebhookTransportUseCase(
    channelProviderRegistry,
    receiveChannelWebhookBatchUseCase,
  );

export const executeChannelPollConnectionUseCase =
  new ExecuteChannelPollConnectionUseCase(
    channelConnectionRepository,
    channelPollCursorRepository,
    receiveChannelPollBatchUseCase,
    channelPollInventoryCommitStore,
  );

const pollChannelConnectionJobHandler = new PollChannelConnectionJobHandler(
  executeChannelPollConnectionUseCase,
  (fields) => {
    console.log(
      JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }),
    );
  },
);

const channelInboxWorkerId =
  process.env.BACKGROUND_JOBS_WORKER_ID ?? "web-default-worker";

jobHandlerRegistry.register(
  new ProcessChannelInboxJobHandler(processChannelInboxItemUseCase, channelInboxWorkerId),
);

if (jobHandlerRegistry.resolve(POLL_CHANNEL_CONNECTION_JOB_TYPE)) {
  throw new Error(
    `Background job handler already registered for ${POLL_CHANNEL_CONNECTION_JOB_TYPE}`,
  );
}

jobHandlerRegistry.register(
  new PollingFeatureGatedPollJobHandler(pollChannelConnectionJobHandler),
);

jobHandlerRegistry.register(
  new ReconcileIcalImportedInventoryJobHandler(reconcileIcalImportedInventoryUseCase, (fields) => {
    console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
  }),
);

jobHandlerRegistry.register(
  new SweepPendingIcalInventoryReconcileJobHandler(sweepPendingIcalInventoryReconcileUseCase),
);

const bookingComAriPushLedger = new PrismaChannelAriPushLedger();
const bookingComAriClient = new BookingComAriClientNotConfigured();
const channelProductMappingRepository = new PrismaChannelProductMappingRepository();
const channelInitialSyncPreviewRepository =
  new PrismaChannelInitialSyncPreviewRepository();
const channelReconciliationRunRepository =
  new PrismaChannelReconciliationRunRepository();
export { channelReconciliationRunRepository };
export { channelProductMappingRepository };
export { channelConnectionProviderSetupRepository };

const bookingComFixtureEnabled = isBookingComFixtureTransportEnabled();
const bookingComRemoteDiscoveryClient = bookingComFixtureEnabled
  ? new FakeBookingComRemoteDiscoveryClient()
  : new BookingComRemoteDiscoveryClientNotConfigured();
const bookingComRemoteAriReader = bookingComFixtureEnabled
  ? new FakeBookingComRemoteAriReader({
      hotelId: defaultFixtureSnapshot().hotel!.hotelId,
      from: "2026-01-01",
      to: "2026-12-31",
      fingerprint: "fixture-remote-ari",
      cells: [],
    })
  : new BookingComRemoteAriReaderNotConfigured();

export const upsertChannelProductMappingUseCase = new UpsertChannelProductMappingUseCase(
  channelConnectionRepository,
  channelConnectionProviderSetupRepository,
  channelProductMappingRepository,
  idGenerator,
  (fields) => {
    console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
  },
);

export const listChannelProductMappingsUseCase = new ListChannelProductMappingsUseCase(
  channelConnectionRepository,
  channelConnectionProviderSetupRepository,
  channelProductMappingRepository,
);

export const validateBookingComMappingsUseCase = new ValidateBookingComMappingsUseCase(
  channelConnectionRepository,
  channelConnectionProviderSetupRepository,
  channelProductMappingRepository,
  bookingComRemoteDiscoveryClient,
  (fields) => {
    console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
  },
);

export const discoverBookingComRemoteConfigUseCase =
  new DiscoverBookingComRemoteConfigUseCase(
    channelConnectionRepository,
    channelConnectionProviderSetupRepository,
    bookingComRemoteDiscoveryClient,
  );

export const requestBookingComAriPropagationUseCase =
  new RequestBookingComAriPropagationUseCase(
    channelConnectionRepository,
    channelListingMappingRepository,
    outboxRepository,
    bookingComAriPushLedger,
    channelProductMappingRepository,
  );

export const propagateChannelUnitSyncUseCase = new PropagateChannelUnitSyncUseCase(
  channelConnectionRepository,
  channelListingMappingRepository,
  channelProductMappingRepository,
  requestBookingComAriPropagationUseCase,
  calendarBlockRepository,
  ratePlanRepository,
  availabilityRulesRepository,
);

outboxHandlerRegistry.register(
  new ChannelUnitSyncOutboxHandler(propagateChannelUnitSyncUseCase),
);
outboxHandlerRegistry.register(new LoggingHandler());

export const generateBookingComInitialSyncPreviewUseCase =
  new GenerateBookingComInitialSyncPreviewUseCase(
    channelConnectionRepository,
    channelConnectionProviderSetupRepository,
    channelProductMappingRepository,
    channelInitialSyncPreviewRepository,
    bookingComRemoteAriReader,
    validateBookingComMappingsUseCase,
    idGenerator,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

export const confirmBookingComInitialSyncUseCase =
  new ConfirmBookingComInitialSyncUseCase(
    channelConnectionRepository,
    channelConnectionProviderSetupRepository,
    channelInitialSyncPreviewRepository,
    requestBookingComAriPropagationUseCase,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

/** Fail-closed until live HTTP client exists; path still enters Receive only. */
const bookingComReservationsClientForRecovery =
  new BookingComReservationsClientNotConfigured();

export const bookingComSummaryRecoveryUseCase = new BookingComSummaryRecoveryUseCase(
  bookingComReservationsClientForRecovery,
  receiveChannelEventUseCase,
);

export const reconcileBookingComConnectionUseCase =
  new ReconcileBookingComConnectionUseCase(
    channelConnectionRepository,
    channelConnectionProviderSetupRepository,
    channelProductMappingRepository,
    channelReconciliationRunRepository,
    bookingComRemoteDiscoveryClient,
    bookingComRemoteAriReader,
    bookingComSummaryRecoveryUseCase,
    requestBookingComAriPropagationUseCase,
    idGenerator,
    (fields) => {
      console.log(JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }));
    },
  );

export const executeBookingComAriPushUseCase = new ExecuteBookingComAriPushUseCase(
  channelConnectionRepository,
  channelListingMappingRepository,
  bookingComAriPushLedger,
  bookingComAriClient,
  (fields) => {
    console.log(
      JSON.stringify({ level: "info", ...fields, timestamp: new Date().toISOString() }),
    );
  },
  channelProductMappingRepository,
);

jobHandlerRegistry.register(
  new PushBookingComAriJobHandler(executeBookingComAriPushUseCase),
);

if (!jobHandlerRegistry.resolve(PUSH_BOOKING_COM_ARI_JOB_TYPE)) {
  throw new Error(
    `Background job handler missing for ${PUSH_BOOKING_COM_ARI_JOB_TYPE}`,
  );
}

if (!jobHandlerRegistry.resolve(RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE)) {
  throw new Error(
    `Background job handler missing for ${RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE}`,
  );
}
if (!jobHandlerRegistry.resolve(SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE)) {
  throw new Error(
    `Background job handler missing for ${SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE}`,
  );
}

export const processJobBatchUseCase = new ProcessJobBatchUseCase(
  backgroundJobRepository,
  jobHandlerRegistry,
);

export { hashToken, generateInviteToken, generatePublishableKey };


