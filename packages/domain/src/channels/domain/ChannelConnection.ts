import { AggregateRoot } from "../../shared/kernel/Entity";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";
import {
  DEFAULT_FEED_SEMANTIC_MODE,
  INITIAL_SEMANTIC_CONFIG_VERSION,
  isFeedSemanticMode,
  parseSemanticConfigVersion,
  type FeedSemanticMode,
} from "../types/FeedSemanticMode";
import {
  assertFeedSemanticModeAllowed,
  type FeedSemanticModeAllowList,
} from "../types/FeedSemanticModePolicy";
import {
  ChannelConnectionStateMachine,
  type ChannelConnectionStatus,
} from "./ChannelConnectionStatus";
import { CredentialReference } from "./value-objects/CredentialReference";
import { WebhookVerificationReference } from "./value-objects/WebhookVerificationReference";

export interface ChannelConnectionProps {
  id: string;
  tenantId: string;
  provider: ChannelSource;
  displayName: string;
  status: ChannelConnectionStatus;
  credentialRef: string | null;
  webhookVerificationRef: string | null;
  lastError: string | null;
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
  /** P1-S7c: connection-scoped inventory mutation fence. Default false. */
  inventoryApplyEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Props as loaded from persistence that may predate S2 semantic columns (S3 backfill path). */
export type LegacyChannelConnectionPersistenceProps = Omit<
  ChannelConnectionProps,
  "semanticMode" | "semanticConfigVersion" | "inventoryApplyEnabled"
> &
  Partial<
    Pick<
      ChannelConnectionProps,
      "semanticMode" | "semanticConfigVersion" | "inventoryApplyEnabled"
    >
  >;

export interface CreateChannelConnectionDraftProps {
  id: string;
  tenantId: string;
  provider: ChannelSource;
  displayName: string;
  now?: Date;
  semanticMode?: FeedSemanticMode;
}

export interface SemanticModeChangeResult {
  changed: true;
  previousMode: FeedSemanticMode;
  newMode: FeedSemanticMode;
  previousSemanticConfigVersion: number;
  newSemanticConfigVersion: number;
}

export interface SemanticModeNoOpResult {
  changed: false;
  mode: FeedSemanticMode;
  semanticConfigVersion: number;
}

export type ApplySemanticModeChangeResult = SemanticModeChangeResult | SemanticModeNoOpResult;

export class ChannelConnection extends AggregateRoot<ChannelConnectionProps> {
  private constructor(props: ChannelConnectionProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get provider(): ChannelSource {
    return this.props.provider;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get status(): ChannelConnectionStatus {
    return this.props.status;
  }

  get credentialRef(): CredentialReference | null {
    return this.props.credentialRef
      ? CredentialReference.create(this.props.credentialRef)
      : null;
  }

  get webhookVerificationRef(): WebhookVerificationReference | null {
    return this.props.webhookVerificationRef
      ? WebhookVerificationReference.create(this.props.webhookVerificationRef)
      : null;
  }

  get lastError(): string | null {
    return this.props.lastError;
  }

  get semanticMode(): FeedSemanticMode {
    return this.props.semanticMode;
  }

  get semanticConfigVersion(): number {
    return this.props.semanticConfigVersion;
  }

  get inventoryApplyEnabled(): boolean {
    return this.props.inventoryApplyEnabled;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static createDraft(props: CreateChannelConnectionDraftProps): ChannelConnection {
    const displayName = props.displayName.trim();
    if (displayName.length === 0 || displayName.length > 255) {
      throw new ValidationError("Connection display name must be between 1 and 255 characters");
    }

    const semanticMode = props.semanticMode ?? DEFAULT_FEED_SEMANTIC_MODE;
    if (!isFeedSemanticMode(semanticMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(semanticMode)}`);
    }

    const now = props.now ?? new Date();
    return new ChannelConnection({
      id: props.id,
      tenantId: props.tenantId,
      provider: props.provider,
      displayName,
      status: "draft",
      credentialRef: null,
      webhookVerificationRef: null,
      lastError: null,
      semanticMode,
      semanticConfigVersion: INITIAL_SEMANTIC_CONFIG_VERSION,
      inventoryApplyEnabled: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Hydrate a fully-specified connection (in-memory / post-S3 persistence).
   * Requires valid semantic fields — no silent defaults for semantics.
   * inventoryApplyEnabled defaults false when omitted (pre-S7c fixtures).
   */
  static reconstitute(
    props: Omit<ChannelConnectionProps, "inventoryApplyEnabled"> & {
      inventoryApplyEnabled?: boolean;
    },
  ): ChannelConnection {
    if (!isFeedSemanticMode(props.semanticMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(props.semanticMode)}`);
    }
    const semanticConfigVersion = parseSemanticConfigVersion(props.semanticConfigVersion);
    return new ChannelConnection({
      ...props,
      semanticMode: props.semanticMode,
      semanticConfigVersion,
      inventoryApplyEnabled: props.inventoryApplyEnabled === true,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  /**
   * S3 migration / legacy Prisma hydration path.
   * Assigns fail-closed defaults when semantic columns are absent.
   * Must NOT be used as an operator mode-change (no audit, no cursor reset, no version bump beyond default 1).
   */
  static hydrateFromLegacyPersistence(
    props: LegacyChannelConnectionPersistenceProps,
  ): ChannelConnection {
    const semanticMode =
      props.semanticMode === undefined
        ? DEFAULT_FEED_SEMANTIC_MODE
        : props.semanticMode;
    if (!isFeedSemanticMode(semanticMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(semanticMode)}`);
    }
    const semanticConfigVersion =
      props.semanticConfigVersion === undefined
        ? INITIAL_SEMANTIC_CONFIG_VERSION
        : parseSemanticConfigVersion(props.semanticConfigVersion);

    return ChannelConnection.reconstitute({
      ...props,
      semanticMode,
      semanticConfigVersion,
      inventoryApplyEnabled: props.inventoryApplyEnabled === true,
    });
  }

  toProps(): ChannelConnectionProps {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      provider: this.props.provider,
      displayName: this.props.displayName,
      status: this.props.status,
      credentialRef: this.props.credentialRef,
      webhookVerificationRef: this.props.webhookVerificationRef,
      lastError: this.props.lastError,
      semanticMode: this.props.semanticMode,
      semanticConfigVersion: this.props.semanticConfigVersion,
      inventoryApplyEnabled: this.props.inventoryApplyEnabled === true,
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  /**
   * Persistence/operator store path only. Does not audit — callers own audit.
   * Fail-closed: never silently defaults missing values to true.
   */
  setInventoryApplyEnabled(enabled: boolean, now: Date = new Date()): void {
    this.props.inventoryApplyEnabled = enabled === true;
    this.props.updatedAt = now;
  }

  attachCredentials(reference: CredentialReference): void {
    ChannelConnectionStateMachine.assertCanAttachCredentials(this.props.status);
    this.props.credentialRef = reference.value;
    this.props.status = "pending_auth";
    this.props.lastError = null;
    this.touch();
  }

  /**
   * Replace the opaque credential reference without changing lifecycle status.
   * Used for rotation while pending_auth / active / paused. Does not write semantic fields.
   */
  replaceCredentialReference(reference: CredentialReference): void {
    ChannelConnectionStateMachine.assertCanMutate(this.props.status);
    this.props.credentialRef = reference.value;
    this.touch();
  }

  /**
   * Update operator-facing display name only. Does not touch provider, semantics, or status.
   */
  updateDisplayName(displayName: string, now: Date = new Date()): void {
    ChannelConnectionStateMachine.assertCanMutate(this.props.status);
    const trimmed = displayName.trim();
    if (trimmed.length === 0 || trimmed.length > 255) {
      throw new ValidationError("Display name must be between 1 and 255 characters");
    }
    this.props.displayName = trimmed;
    this.props.updatedAt = now;
  }

  attachWebhookVerification(reference: WebhookVerificationReference): void {
    ChannelConnectionStateMachine.assertCanMutate(this.props.status);
    this.props.webhookVerificationRef = reference.value;
    this.touch();
  }

  activate(now: Date = new Date()): void {
    ChannelConnectionStateMachine.assertCanActivate(this.props.status);
    this.assertHasCredentialRef();
    this.assertHasValidSemanticConfiguration();
    this.props.status = "active";
    this.props.lastError = null;
    this.props.updatedAt = now;
  }

  /**
   * Provider + permission gates for activation (application layer supplies policy inputs).
   */
  assertSemanticActivationAllowed(input: {
    allowedFeedSemanticModes: FeedSemanticModeAllowList;
    actorMayDeclareReservationFeed: boolean;
  }): void {
    this.assertHasValidSemanticConfiguration();
    assertFeedSemanticModeAllowed(this.props.semanticMode, input.allowedFeedSemanticModes);
    if (
      this.props.semanticMode === "reservation_feed" &&
      !input.actorMayDeclareReservationFeed
    ) {
      throw new ValidationError(
        "Activating a connection with reservation_feed requires elevated declare_reservation_feed authorization",
      );
    }
  }

  /**
   * Operator-driven semantic mode transition on the aggregate.
   * Same-mode updates are a documented no-op (no version increment).
   * Does not audit, confirm, or reset cursors — application use case owns those.
   */
  applySemanticModeChange(
    newMode: FeedSemanticMode,
    now: Date = new Date(),
  ): ApplySemanticModeChangeResult {
    ChannelConnectionStateMachine.assertCanMutate(this.props.status);
    if (!isFeedSemanticMode(newMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(newMode)}`);
    }

    if (newMode === this.props.semanticMode) {
      return {
        changed: false,
        mode: this.props.semanticMode,
        semanticConfigVersion: this.props.semanticConfigVersion,
      };
    }

    const previousMode = this.props.semanticMode;
    const previousSemanticConfigVersion = this.props.semanticConfigVersion;
    this.props.semanticMode = newMode;
    this.props.semanticConfigVersion = previousSemanticConfigVersion + 1;
    this.props.updatedAt = now;

    return {
      changed: true,
      previousMode,
      newMode,
      previousSemanticConfigVersion,
      newSemanticConfigVersion: this.props.semanticConfigVersion,
    };
  }

  pause(now: Date = new Date()): void {
    ChannelConnectionStateMachine.assertCanPause(this.props.status);
    this.props.status = "paused";
    this.touch(now);
  }

  resume(now: Date = new Date()): void {
    ChannelConnectionStateMachine.assertCanResume(this.props.status);
    this.assertHasCredentialRef();
    this.props.status = "active";
    this.props.lastError = null;
    this.props.updatedAt = now;
  }

  markError(message: string, now: Date = new Date()): void {
    ChannelConnectionStateMachine.assertCanMarkError(this.props.status);
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      throw new ValidationError("Error message must be between 1 and 500 characters");
    }
    this.props.status = "error";
    this.props.lastError = trimmed;
    this.props.updatedAt = now;
  }

  disconnect(now: Date = new Date()): void {
    if (this.props.status === "disconnected") {
      throw new ConflictError("Connection is already disconnected");
    }
    this.props.status = "disconnected";
    this.props.credentialRef = null;
    this.props.webhookVerificationRef = null;
    this.props.lastError = null;
    this.props.updatedAt = now;
  }

  private assertHasCredentialRef(): void {
    if (this.props.credentialRef == null) {
      throw new ValidationError("CredentialReference is required");
    }
  }

  private assertHasValidSemanticConfiguration(): void {
    if (!isFeedSemanticMode(this.props.semanticMode)) {
      throw new ValidationError(`Invalid feed semantic mode: ${String(this.props.semanticMode)}`);
    }
    if (
      typeof this.props.semanticConfigVersion !== "number" ||
      !Number.isInteger(this.props.semanticConfigVersion) ||
      this.props.semanticConfigVersion < 1
    ) {
      throw new ValidationError("semanticConfigVersion must be a positive integer");
    }
  }

  private touch(now: Date = new Date()): void {
    this.props.updatedAt = now;
  }
}
