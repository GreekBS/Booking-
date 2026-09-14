import { EnqueueJobUseCase } from "../../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { ChannelConnection } from "../../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../../src/channels/domain/value-objects/CredentialReference";
import { ChannelIngressBatchProcessor } from "../../../src/channels/application/ChannelIngressBatchProcessor";
import { ReceiveChannelPollBatchUseCase } from "../../../src/channels/application/ReceiveChannelPollBatchUseCase";
import { ExecuteChannelPollConnectionUseCase } from "../../../src/channels/application/ExecuteChannelPollConnectionUseCase";
import { PollChannelConnectionJobHandler } from "../../../src/channels/jobs/PollChannelConnectionJobHandler";
import { ReceiveChannelEventUseCase } from "../../../src/channels/application/ReceiveChannelEventUseCase";
import { ChannelProviderRegistry } from "../../../src/channels/providers/ChannelProviderRegistry";
import { InMemoryChannelConnectionRepository } from "../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelInboxRepository } from "../../../src/channels/repositories/InMemoryChannelInboxRepository";
import { InMemoryChannelPollCursorRepository } from "../../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelCredentialResolver } from "../../../src/channels/infrastructure/InMemoryChannelCredentialResolver";
import type { IChannelPollDiagnosticsReporter } from "../../../src/channels/ports/IChannelPollDiagnosticsReporter";
import type { IJobScheduler } from "../../../src/platform/async/jobs/ports/IJobScheduler";
import type { EnqueueJobCommand, BackgroundJobEntry } from "../../../src/shared/types/index";
import { createTestIcalProviderRegistration } from "../ical/helpers/icalTestProvider";
import { encodeIcsCalendar } from "../ical/helpers/encodeIcsCalendar";

class InMemoryJobScheduler implements IJobScheduler {
  readonly jobs = new Map<string, BackgroundJobEntry>();

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    const key = command.idempotencyKey ?? command.jobType;
    const existing = [...this.jobs.values()].find(
      (job) => job.jobType === command.jobType && job.idempotencyKey === command.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    const job: BackgroundJobEntry = {
      id: `job-${this.jobs.size + 1}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      priority: command.priority ?? 0,
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      attemptCount: 0,
      maxAttempts: command.maxAttempts ?? 5,
    createdAt: new Date(),
    };
    this.jobs.set(key, job);
    return job;
  }

  async cancel(): Promise<void> {}
}

export interface IcalIngressTestStackOptions {
  tenantId?: string;
  connectionId?: string;
  feedUrl?: string;
  feedBody?: Uint8Array;
  diagnosticsReporter?: IChannelPollDiagnosticsReporter;
}

export interface IcalIngressTestStack {
  tenantId: string;
  connectionId: string;
  feedUrl: string;
  feedBody: Uint8Array;
  providerRegistry: ChannelProviderRegistry;
  connectionRepository: InMemoryChannelConnectionRepository;
  inboxRepository: InMemoryChannelInboxRepository;
  credentialResolver: InMemoryChannelCredentialResolver;
  receiveChannelEventUseCase: ReceiveChannelEventUseCase;
  batchProcessor: ChannelIngressBatchProcessor;
  pollBatchUseCase: ReceiveChannelPollBatchUseCase;
  pollConnectionUseCase: ExecuteChannelPollConnectionUseCase;
  pollConnectionJobHandler: PollChannelConnectionJobHandler;
  cursorRepository: InMemoryChannelPollCursorRepository;
  jobScheduler: InMemoryJobScheduler;
  diagnosticsReporter: IChannelPollDiagnosticsReporter;
}

export async function createIcalIngressTestStack(
  options: IcalIngressTestStackOptions = {},
): Promise<IcalIngressTestStack> {
  const tenantId = options.tenantId ?? "550e8400-e29b-41d4-a716-446655440300";
  const connectionId = options.connectionId ?? "550e8400-e29b-41d4-a716-446655440301";
  const feedUrl = options.feedUrl ?? "https://example.test/feed.ics";
  const feedBody =
    options.feedBody ??
    encodeIcsCalendar([{ uid: "evt-1@x", dtstart: "20260101", dtend: "20260102" }]);

  const diagnosticsReporter = options.diagnosticsReporter ?? {
    reportIcalMapIssues: () => {},
  };

  const providerRegistry = new ChannelProviderRegistry();
  providerRegistry.register(createTestIcalProviderRegistration(() => feedBody));

  const connectionRepository = new InMemoryChannelConnectionRepository();
  const inboxRepository = new InMemoryChannelInboxRepository();
  const credentialResolver = new InMemoryChannelCredentialResolver();
  const jobScheduler = new InMemoryJobScheduler();
  let idCounter = 0;

  const credentialRef = CredentialReference.create("cred_ical_test");
  credentialResolver.seedCredential(credentialRef, { feedUrl });

  const connection = ChannelConnection.createDraft({
    id: connectionId,
    tenantId,
    provider: "ical",
    displayName: "iCal Test Connection",
  });
  connection.attachCredentials(credentialRef);
  connection.activate();
  await connectionRepository.create(connection);

  const receiveChannelEventUseCase = new ReceiveChannelEventUseCase(
    inboxRepository,
    new EnqueueJobUseCase(jobScheduler),
    { generate: () => `inbox-${++idCounter}` },
  );
  const batchProcessor = new ChannelIngressBatchProcessor(receiveChannelEventUseCase);
  const pollBatchUseCase = new ReceiveChannelPollBatchUseCase(
    connectionRepository,
    credentialResolver,
    providerRegistry,
    batchProcessor,
    diagnosticsReporter,
  );
  const cursorRepository = new InMemoryChannelPollCursorRepository(connectionRepository);
  const pollConnectionUseCase = new ExecuteChannelPollConnectionUseCase(
    connectionRepository,
    cursorRepository,
    pollBatchUseCase,
  );
  const pollConnectionJobHandler = new PollChannelConnectionJobHandler(pollConnectionUseCase);

  return {
    tenantId,
    connectionId,
    feedUrl,
    feedBody,
    providerRegistry,
    connectionRepository,
    inboxRepository,
    credentialResolver,
    receiveChannelEventUseCase,
    batchProcessor,
    pollBatchUseCase,
    pollConnectionUseCase,
    pollConnectionJobHandler,
    cursorRepository,
    jobScheduler,
    diagnosticsReporter,
  };
}
