import {
  ChannelProviderRegistry,
  EnqueueJobUseCase,
  ImportChannelReservationCommandUseCase,
  ImportChannelReservationCreateDryRunUseCase,
  PermissionChecker,
  PrepareReservationUseCase,
  ProcessChannelInboxItemUseCase,
  ProcessChannelInboxJobHandler,
  ProcessJobBatchUseCase,
  ReceiveChannelEventUseCase,
  ReplayChannelInboxItemUseCase,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
  JobHandlerRegistry,
} from "@hcp/domain";
import { createFakeChannelProviderRegistration } from "../../../domain/src/channels/simulation/FakeChannelProviderBundle";
import { FakeChannelReservationImportProvider } from "../../../domain/src/channels/simulation/FakeChannelReservationImportProvider";
import { PROCESS_CHANNEL_INBOX_JOB_TYPE } from "../../../domain/src/platform/async/jobs/types/JobTypes";
import type { IChannelReservationImportProvider } from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaChannelConnectionRepository,
  PrismaChannelInboxRepository,
  PrismaChannelListingMappingRepository,
  PrismaChannelReservationImportPersistence,
  PrismaBookingRepository,
  PrismaCalendarBlockRepository,
  PrismaCatalogQueryAdapter,
  PrismaExternalReservationLinkRepository,
  PrismaGuestRepository,
  PrismaHoldRepository,
  PrismaJobScheduler,
  PrismaOutboxRepository,
  PrismaQuoteRepository,
  PrismaRatePlanRepository,
  PrismaAvailabilityRulesRepository,
  TimezoneService,
  UuidIdGenerator,
} from "../../src";

export function buildChannelInboxIntegrationStack() {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const linkRepository = new PrismaExternalReservationLinkRepository();
  const connectionRepository = new PrismaChannelConnectionRepository();
  const mappingRepository = new PrismaChannelListingMappingRepository();
  const inboxRepository = new PrismaChannelInboxRepository();
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const idGenerator = new UuidIdGenerator();
  const importPersistence = new PrismaChannelReservationImportPersistence(outboxRepository);

  const registry = new ChannelProviderRegistry();
  const importProvider = new FakeChannelReservationImportProvider();
  const reservationImport: IChannelReservationImportProvider = {
    mapMessage: (message, context) => importProvider.mapMessage(message, context),
  };
  registry.register({
    ...createFakeChannelProviderRegistration(),
    reservationImport,
  });

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const prepareReservationUseCase = new PrepareReservationUseCase(
    catalogQueryAdapter,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );

  const importDryRunUseCase = new ImportChannelReservationCreateDryRunUseCase(
    registry,
    connectionRepository,
    mappingRepository,
    linkRepository,
  );

  const importCommandUseCase = new ImportChannelReservationCommandUseCase(
    linkRepository,
    mappingRepository,
    prepareReservationUseCase,
    importPersistence,
    idGenerator,
    new ResolveOrCreateGuest(new PrismaGuestRepository(), idGenerator, new PermissionChecker()),
  );

  const processInboxUseCase = new ProcessChannelInboxItemUseCase(
    inboxRepository,
    importDryRunUseCase,
    importCommandUseCase,
    idGenerator,
  );

  const backgroundJobRepository = new PrismaBackgroundJobRepository();
  const jobScheduler = new PrismaJobScheduler(backgroundJobRepository);
  const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);

  const receiveUseCase = new ReceiveChannelEventUseCase(
    inboxRepository,
    enqueueJobUseCase,
    idGenerator,
  );

  const replayUseCase = new ReplayChannelInboxItemUseCase(inboxRepository, receiveUseCase);

  const jobHandlerRegistry = new JobHandlerRegistry();
  jobHandlerRegistry.register(
    new ProcessChannelInboxJobHandler(processInboxUseCase, "integration-worker"),
  );
  const processJobBatchUseCase = new ProcessJobBatchUseCase(
    backgroundJobRepository,
    jobHandlerRegistry,
  );

  return {
    inboxRepository,
    receiveUseCase,
    replayUseCase,
    processInboxUseCase,
    processJobBatchUseCase,
    backgroundJobRepository,
    bookingRepository,
    linkRepository,
    calendarRepository,
    connectionRepository,
    mappingRepository,
    importProvider,
    PROCESS_CHANNEL_INBOX_JOB_TYPE,
  };
}
