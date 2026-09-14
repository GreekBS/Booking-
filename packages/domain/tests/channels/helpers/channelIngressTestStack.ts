import { EnqueueJobUseCase } from "../../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { ChannelConnection } from "../../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../../src/channels/domain/value-objects/CredentialReference";
import { WebhookVerificationReference } from "../../../src/channels/domain/value-objects/WebhookVerificationReference";
import { ChannelIngressBatchProcessor } from "../../../src/channels/application/ChannelIngressBatchProcessor";
import { ReceiveChannelWebhookBatchUseCase } from "../../../src/channels/application/ReceiveChannelWebhookBatchUseCase";
import { HandleChannelWebhookTransportUseCase } from "../../../src/channels/application/HandleChannelWebhookTransportUseCase";
import { ReceiveChannelPollBatchUseCase } from "../../../src/channels/application/ReceiveChannelPollBatchUseCase";
import { ExecuteChannelPollConnectionUseCase } from "../../../src/channels/application/ExecuteChannelPollConnectionUseCase";
import { PollChannelConnectionJobHandler } from "../../../src/channels/jobs/PollChannelConnectionJobHandler";
import { ReceiveChannelEventUseCase } from "../../../src/channels/application/ReceiveChannelEventUseCase";
import { ChannelProviderRegistry } from "../../../src/channels/providers/ChannelProviderRegistry";
import { InMemoryChannelConnectionRepository } from "../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelInboxRepository } from "../../../src/channels/repositories/InMemoryChannelInboxRepository";
import { InMemoryChannelPollCursorRepository } from "../../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelCredentialResolver } from "../../../src/channels/infrastructure/InMemoryChannelCredentialResolver";
import {
  createTestChannelTransportProviderRegistration,
  TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
} from "../../../src/channels/simulation/TestChannelTransportProviderBundle";
import { TestChannelPollingProvider } from "../../../src/channels/simulation/TestChannelPollingProvider";
import { TestChannelWebhookProvider } from "../../../src/channels/simulation/TestChannelWebhookProvider";
import type { IJobScheduler } from "../../../src/platform/async/jobs/ports/IJobScheduler";
import type { EnqueueJobCommand, BackgroundJobEntry } from "../../../src/shared/types/index";

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

export interface ChannelIngressTestStackOptions {
  tenantId?: string;
  connectionId?: string;
  webhookSecret?: string;
  credentialToken?: string;
  /** Override provider registration (e.g. polling-only). */
  registration?: ReturnType<typeof createTestChannelTransportProviderRegistration>;
  providerId?: string;
}

export interface ChannelIngressTestStack {
  tenantId: string;
  connectionId: string;
  providerRegistry: ChannelProviderRegistry;
  connectionRepository: InMemoryChannelConnectionRepository;
  inboxRepository: InMemoryChannelInboxRepository;
  credentialResolver: InMemoryChannelCredentialResolver;
  webhookProvider: TestChannelWebhookProvider;
  pollingProvider: TestChannelPollingProvider;
  receiveChannelEventUseCase: ReceiveChannelEventUseCase;
  batchProcessor: ChannelIngressBatchProcessor;
  webhookBatchUseCase: ReceiveChannelWebhookBatchUseCase;
  pollBatchUseCase: ReceiveChannelPollBatchUseCase;
  pollConnectionUseCase: ExecuteChannelPollConnectionUseCase;
  pollConnectionJobHandler: PollChannelConnectionJobHandler;
  cursorRepository: InMemoryChannelPollCursorRepository;
  webhookTransportUseCase: HandleChannelWebhookTransportUseCase;
  jobScheduler: InMemoryJobScheduler;
}

export async function createChannelIngressTestStack(
  options: ChannelIngressTestStackOptions = {},
): Promise<ChannelIngressTestStack> {
  const tenantId = options.tenantId ?? "550e8400-e29b-41d4-a716-446655440200";
  const connectionId = options.connectionId ?? "550e8400-e29b-41d4-a716-446655440201";
  const webhookSecret = options.webhookSecret ?? "test-webhook-secret";
  const credentialToken = options.credentialToken ?? "test-credential-token";

  const providerRegistry = new ChannelProviderRegistry();
  const webhookProvider = new TestChannelWebhookProvider();
  const pollingProvider = new TestChannelPollingProvider();
  const registration =
    options.registration ??
    createTestChannelTransportProviderRegistration({
      webhookProvider,
      pollingProvider,
    });
  // Prefer explicit providers from registration when present.
  const resolvedWebhook =
    (registration.webhooks as TestChannelWebhookProvider | null) ?? webhookProvider;
  const resolvedPolling =
    (registration.polling as TestChannelPollingProvider | null) ?? pollingProvider;
  providerRegistry.register({
    ...registration,
    webhooks: registration.webhooks ?? null,
    polling: registration.polling ?? resolvedPolling,
  });

  const connectionRepository = new InMemoryChannelConnectionRepository();
  const inboxRepository = new InMemoryChannelInboxRepository();
  const credentialResolver = new InMemoryChannelCredentialResolver();
  const jobScheduler = new InMemoryJobScheduler();
  let idCounter = 0;

  const webhookRef = WebhookVerificationReference.create("whsec_test_transport");
  const credentialRef = CredentialReference.create("cred_test_transport");
  credentialResolver.seedWebhookVerification(webhookRef, webhookSecret);
  credentialResolver.seedCredential(credentialRef, { token: credentialToken });

  const providerId = options.providerId ?? registration.providerId;
  const connection = ChannelConnection.createDraft({
    id: connectionId,
    tenantId,
    provider: providerId,
    displayName: "Test Transport Connection",
  });
  if (registration.capabilities.inbound.webhooks) {
    connection.attachWebhookVerification(webhookRef);
  }
  connection.attachCredentials(credentialRef);
  connection.activate();

  await connectionRepository.create(connection);

  const receiveChannelEventUseCase = new ReceiveChannelEventUseCase(
    inboxRepository,
    new EnqueueJobUseCase(jobScheduler),
    { generate: () => `inbox-${++idCounter}` },
  );
  const batchProcessor = new ChannelIngressBatchProcessor(receiveChannelEventUseCase);
  const webhookBatchUseCase = new ReceiveChannelWebhookBatchUseCase(
    connectionRepository,
    credentialResolver,
    providerRegistry,
    batchProcessor,
  );
  const pollBatchUseCase = new ReceiveChannelPollBatchUseCase(
    connectionRepository,
    credentialResolver,
    providerRegistry,
    batchProcessor,
  );
  const cursorRepository = new InMemoryChannelPollCursorRepository(connectionRepository);
  const pollConnectionUseCase = new ExecuteChannelPollConnectionUseCase(
    connectionRepository,
    cursorRepository,
    pollBatchUseCase,
  );
  const pollConnectionJobHandler = new PollChannelConnectionJobHandler(pollConnectionUseCase);
  const webhookTransportUseCase = new HandleChannelWebhookTransportUseCase(
    providerRegistry,
    webhookBatchUseCase,
  );

  return {
    tenantId,
    connectionId,
    providerRegistry,
    connectionRepository,
    inboxRepository,
    credentialResolver,
    webhookProvider: resolvedWebhook,
    pollingProvider: resolvedPolling,
    receiveChannelEventUseCase,
    batchProcessor,
    webhookBatchUseCase,
    pollBatchUseCase,
    pollConnectionUseCase,
    pollConnectionJobHandler,
    cursorRepository,
    webhookTransportUseCase,
    jobScheduler,
  };
}
