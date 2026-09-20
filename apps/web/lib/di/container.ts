import {

  CreateTenantUseCase,

  SuspendTenantUseCase,

  ActivateTenantUseCase,

  UpdateTenantUseCase,

  ListTenantsUseCase,

  GetTenantUseCase,

  GetPlatformOverviewUseCase,

  CreatePropertyUseCase,

  UpdatePropertyUseCase,

  ArchivePropertyUseCase,

  GetPropertyUseCase,

  ListPropertiesUseCase,

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

  ConfigureAvailabilityRulesUseCase,

  ConfigureRatePlanUseCase,

  GetAvailabilityRulesUseCase,

  GetRatePlanUseCase,

  GetQuoteUseCase,

  ListBookingsUseCase,

  GetBookingUseCase,

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

  ResumeChannelConnectionUseCase,

  PauseChannelConnectionUseCase,

  DisconnectChannelConnectionUseCase,

} from "@hcp/domain";

import {

  PrismaOutboxRepository,

  PrismaBackgroundJobRepository,

  PrismaJobScheduler,

  PrismaTenantRepository,

  PrismaPropertyRepository,

  PrismaUserRepository,

  PrismaPlatformSuperAdminMutation,

  PrismaMembershipRepository,

  PrismaInvitationRepository,

  PrismaAuditLogRepository,

  PrismaLeadRepository,

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

  PrismaChannelConnectionHealthQuery,

  PrismaDeactivateChannelConnectionInventoryStore,

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
);

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

const calendarBlockRepository = new PrismaCalendarBlockRepository();

const ratePlanRepository = new PrismaRatePlanRepository();

const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();

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

);



export const deleteManualBlockUseCase = new DeleteManualBlockUseCase(

  calendarBlockRepository,

  permissionChecker,

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



export const createBookingUseCase = new CreateBookingUseCase(

  holdRepository,

  quoteRepository,

  commerceFlowRepository,

  permissionChecker,

  auditLogRepository,

  idGenerator,

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



export const configureAvailabilityRulesUseCase = new ConfigureAvailabilityRulesUseCase(

  catalogQueryAdapter,

  availabilityRulesRepository,

  permissionChecker,

);



export const configureRatePlanUseCase = new ConfigureRatePlanUseCase(

  catalogQueryAdapter,

  ratePlanRepository,

  permissionChecker,

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
outboxHandlerRegistry.register(new LoggingHandler());

export const processOutboxBatchUseCase = new ProcessOutboxBatchUseCase(
  outboxRepository,
  outboxHandlerRegistry,
);

/** CM-4b S4a-2a: one production registry; empty allow-list is valid (zero providers). */
const channelProviderRegistry = createProductionChannelProviderRegistry();
const channelConnectionRepository = new PrismaChannelConnectionRepository();
const channelListingMappingRepository = new PrismaChannelListingMappingRepository();
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

export const createChannelConnectionUseCase = new CreateChannelConnectionUseCase(
  channelConnectionRepository,
  permissionChecker,
  idGenerator,
  auditLogRepository,
);

export const listChannelConnectionsUseCase = new ListChannelConnectionsUseCase(
  channelConnectionRepository,
  permissionChecker,
);

export const getChannelConnectionUseCase = new GetChannelConnectionUseCase(
  channelConnectionRepository,
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
);

export const resumeChannelConnectionUseCase = new ResumeChannelConnectionUseCase(
  channelConnectionRepository,
  channelProviderRegistry,
  permissionChecker,
  channelConnectionLifecycleUnitOfWork,
  icalCredentialRotationStore,
);

export const pauseChannelConnectionUseCase = new PauseChannelConnectionUseCase(
  channelConnectionRepository,
  permissionChecker,
  channelConnectionLifecycleUnitOfWork,
);

export const disconnectChannelConnectionUseCase =
  new DisconnectChannelConnectionUseCase(
    channelConnectionRepository,
    permissionChecker,
    channelConnectionLifecycleUnitOfWork,
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
);

export const processChannelInboxItemUseCase = new ProcessChannelInboxItemUseCase(
  channelInboxRepository,
  importChannelReservationCreateDryRunUseCase,
  importChannelReservationCommandUseCase,
  idGenerator,
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


