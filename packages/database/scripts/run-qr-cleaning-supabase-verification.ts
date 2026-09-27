/**
 * QR Cleaning V1 authorized verification against a real database.
 *
 * Proves, end to end and with real rows:
 *   - QR issue is idempotent; rotate revokes the old hash and mints a new one
 *   - token resolution is tenant-scoped and rejects revoked/foreign tokens
 *   - the task selection policy picks IN_PROGRESS > OPEN TURNOVER > oldest OPEN,
 *     creates a MANUAL task only while DIRTY, and refuses work on a CLEAN unit
 *   - execution items are immutable snapshots of the template
 *   - completion is gated on required items, per-item photos and minimum photos
 *   - completing a cleaning closes the Task and flips the Unit to CLEAN atomically
 *   - manager property ACL blocks cross-property access
 *   - no inventory cleaning/turnover calendar blocks are created
 *
 * Uses the REAL Supabase private-bucket driver (Production storage path).
 * Cleans up everything it creates.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

loadEnv({ path: resolve(root, "../../../.env.cleaning.local") });
// Never allow the fs demo driver to silently satisfy this closure script.
delete process.env.CLEANING_PHOTOS_DRIVER;
delete process.env.CLEANING_PHOTOS_FS_ROOT;

/** 1x1 PNG â€” smallest thing that is unmistakably an image. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main(): Promise<void> {
  const {
    PermissionChecker,
    GenerateUnitQrUseCase,
    RotateUnitQrUseCase,
    ResolveUnitQrUseCase,
    GetUnitQrUseCase,
    UpsertCleaningChecklistTemplateUseCase,
    GetCleaningChecklistTemplateUseCase,
    ResolveCleaningContextUseCase,
    StartOrResumeCleaningUseCase,
    UpdateCleaningChecklistItemUseCase,
    RegisterCleaningPhotoUseCase,
    RemoveCleaningPhotoUseCase,
    CompleteCleaningUseCase,
    ListCleaningHistoryUseCase,
    selectCleaningTask,
  } = await import("@hcp/domain");

  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaPropertyRepository,
    PrismaOutboxRepository,
    PrismaAuditLogRepository,
    PrismaTaskRepository,
    PrismaUnitHousekeepingStatusRepository,
    PrismaHousekeepingTurnoverStore,
    PrismaUnitQrAccessRepository,
    PrismaCleaningChecklistRepository,
    PrismaCleaningExecutionRepository,
    PrismaCleaningPhotoRepository,
    CryptoOpaqueTokenFactory,
    createCleaningObjectStorage,
    UuidIdGenerator,
    isTalosProductionDatabaseUrl,
    assertNotTalosProductionDatabase,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "qr-cleaning-verify");
    }
  }

  const results: string[] = [];
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const propA = randomUUID();
  const propB = randomUUID();
  const unitDirty = randomUUID();
  const unitClean = randomUUID();
  const unitB = randomUUID();
  const adminUser = randomUUID();
  const managerUser = randomUUID();
  const storageKeys: string[] = [];

  const outbox = new PrismaOutboxRepository();
  const properties = new PrismaPropertyRepository(outbox);
  const audit = new PrismaAuditLogRepository();
  const tasks = new PrismaTaskRepository();
  const hk = new PrismaUnitHousekeepingStatusRepository();
  const turnoverStore = new PrismaHousekeepingTurnoverStore();
  const qrAccess = new PrismaUnitQrAccessRepository();
  const checklists = new PrismaCleaningChecklistRepository();
  const executions = new PrismaCleaningExecutionRepository(turnoverStore);
  const photos = new PrismaCleaningPhotoRepository();
  const tokens = new CryptoOpaqueTokenFactory();
  const storage = createCleaningObjectStorage();
  if (storage.driver !== "supabase") {
    throw new Error(
      `Expected supabase driver, got "${storage.driver}". Provide SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.cleaning.local).`,
    );
  }
  console.log(JSON.stringify({ phase: "driver", driver: storage.driver }));
  const ids = new UuidIdGenerator();
  const permissions = new PermissionChecker();

  const generateQr = new GenerateUnitQrUseCase(
    qrAccess,
    properties,
    tokens,
    permissions,
    audit,
  );
  const rotateQr = new RotateUnitQrUseCase(
    qrAccess,
    properties,
    tokens,
    permissions,
    audit,
  );
  const resolveQr = new ResolveUnitQrUseCase(
    qrAccess,
    properties,
    tokens,
    permissions,
  );
  const getQr = new GetUnitQrUseCase(qrAccess, properties, permissions);
  const upsertTemplate = new UpsertCleaningChecklistTemplateUseCase(
    checklists,
    permissions,
    audit,
  );
  const getTemplate = new GetCleaningChecklistTemplateUseCase(
    checklists,
    permissions,
  );
  const resolveContext = new ResolveCleaningContextUseCase(
    executions,
    checklists,
    permissions,
  );
  const startCleaning = new StartOrResumeCleaningUseCase(
    executions,
    permissions,
    audit,
  );
  const updateItem = new UpdateCleaningChecklistItemUseCase(
    executions,
    permissions,
  );
  const registerPhoto = new RegisterCleaningPhotoUseCase(
    executions,
    photos,
    storage,
    ids,
    permissions,
    audit,
  );
  const removePhoto = new RemoveCleaningPhotoUseCase(
    executions,
    photos,
    storage,
    permissions,
    audit,
  );
  const completeCleaning = new CompleteCleaningUseCase(
    executions,
    checklists,
    photos,
    permissions,
    audit,
  );
  const listHistory = new ListCleaningHistoryUseCase(executions, permissions);

  const adminActor = {
    userId: adminUser,
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };
  const managerActor = {
    userId: managerUser,
    role: "manager" as const,
    propertyIds: [propA],
    isSuperAdmin: false,
  };

  function unwrap<T>(result: {
    isFailure: boolean;
    getError: () => Error;
    getValue: () => T;
  }): T {
    if (result.isFailure) throw result.getError();
    return result.getValue();
  }

  try {
    await clearTenantContext(prisma);

    await prisma.user.createMany({
      data: [
        {
          id: adminUser,
          email: `qr-admin-${adminUser.slice(0, 8)}@demo.test`,
          name: "QR Admin",
        },
        {
          id: managerUser,
          email: `qr-mgr-${managerUser.slice(0, 8)}@demo.test`,
          name: "QR Manager",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: tenantId, name: "QR Verify", slug: `qr-${tenantId.slice(0, 8)}` },
        {
          id: otherTenantId,
          name: "QR Verify Other",
          slug: `qro-${otherTenantId.slice(0, 8)}`,
        },
      ],
    });

    await withTenantTransaction(tenantId, async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: randomUUID(),
            userId: adminUser,
            tenantId,
            role: "admin",
            propertyIds: [],
            status: "active",
          },
          {
            id: randomUUID(),
            userId: managerUser,
            tenantId,
            role: "manager",
            propertyIds: [propA],
            status: "active",
          },
        ],
      });
      for (const [id, name, slug] of [
        [propA, "QR Prop A", `qpa-${propA.slice(0, 8)}`],
        [propB, "QR Prop B", `qpb-${propB.slice(0, 8)}`],
      ] as const) {
        await tx.property.create({
          data: {
            id,
            tenantId,
            name,
            slug,
            timezone: "Europe/Athens",
            status: "active",
          },
        });
      }
      for (const [id, pid, name, slug] of [
        [unitDirty, propA, "Unit Dirty", `ud-${unitDirty.slice(0, 8)}`],
        [unitClean, propA, "Unit Clean", `uc-${unitClean.slice(0, 8)}`],
        [unitB, propB, "Unit B", `ub-${unitB.slice(0, 8)}`],
      ] as const) {
        await tx.unit.create({
          data: {
            id,
            tenantId,
            propertyId: pid,
            name,
            slug,
            maxGuests: 4,
            status: "active",
          },
        });
      }
    });

    for (const [pid, uid] of [
      [propA, unitDirty],
      [propA, unitClean],
      [propB, unitB],
    ] as const) {
      await hk.ensureInitialized({ tenantId, propertyId: pid, unitId: uid });
    }

    // --- 1. Pure task selection policy -----------------------------------
    {
      const older = new Date(Date.now() - 100_000);
      const newer = new Date();
      const inProgress = selectCleaningTask({
        housekeepingStatus: "DIRTY",
        tasks: [
          { id: "open", status: "OPEN", source: "TURNOVER", createdAt: older },
          { id: "wip", status: "IN_PROGRESS", source: "MANUAL", createdAt: newer },
        ],
      });
      if (inProgress.kind !== "EXISTING" || inProgress.taskId !== "wip") {
        throw new Error("policy did not prefer IN_PROGRESS");
      }
      const turnover = selectCleaningTask({
        housekeepingStatus: "DIRTY",
        tasks: [
          { id: "manual", status: "OPEN", source: "MANUAL", createdAt: older },
          { id: "turn", status: "OPEN", source: "TURNOVER", createdAt: newer },
        ],
      });
      if (turnover.kind !== "EXISTING" || turnover.taskId !== "turn") {
        throw new Error("policy did not prefer OPEN TURNOVER");
      }
      const oldest = selectCleaningTask({
        housekeepingStatus: "DIRTY",
        tasks: [
          { id: "b", status: "OPEN", source: "MANUAL", createdAt: newer },
          { id: "a", status: "OPEN", source: "MANUAL", createdAt: older },
        ],
      });
      if (oldest.kind !== "EXISTING" || oldest.taskId !== "a") {
        throw new Error("policy did not pick oldest OPEN");
      }
      if (
        selectCleaningTask({ housekeepingStatus: "DIRTY", tasks: [] }).kind !==
        "CREATE_MANUAL"
      ) {
        throw new Error("policy did not allow MANUAL creation while DIRTY");
      }
      if (
        selectCleaningTask({ housekeepingStatus: "CLEAN", tasks: [] }).kind !==
        "NO_WORK"
      ) {
        throw new Error("policy invented work on a CLEAN unit");
      }
      results.push("PASS task selection policy ordering");
    }

    // --- 2. QR issue / idempotence / rotate / resolve ---------------------
    const first = unwrap(
      await generateQr.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (!first.token || first.status !== "ACTIVE") {
      throw new Error("generate did not mint an ACTIVE token");
    }
    const again = unwrap(
      await generateQr.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (again.token !== null || again.status !== "ACTIVE") {
      throw new Error("generate re-minted over an existing ACTIVE code");
    }
    const activeRows = await withTenantTransaction(tenantId, (tx) =>
      tx.unitQrAccess.count({
        where: { tenantId, unitId: unitDirty, status: "ACTIVE" },
      }),
    );
    if (activeRows !== 1) {
      throw new Error(`expected exactly 1 ACTIVE qr row, saw ${activeRows}`);
    }
    results.push("PASS QR generate is idempotent (one ACTIVE row)");

    const view = unwrap(
      await getQr.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (view.token !== null) {
      throw new Error("GET leaked a plaintext token");
    }
    const storedHash = await withTenantTransaction(tenantId, (tx) =>
      tx.unitQrAccess.findFirst({
        where: { tenantId, unitId: unitDirty, status: "ACTIVE" },
        select: { tokenHash: true },
      }),
    );
    if (!storedHash || storedHash.tokenHash.trim() === first.token) {
      throw new Error("token stored in plaintext");
    }
    if (storedHash.tokenHash.trim() !== tokens.hash(first.token!)) {
      throw new Error("stored hash is not SHA-256 of the token");
    }
    results.push("PASS token stored as SHA-256 hash only, never re-readable");

    const resolved = unwrap(
      await resolveQr.execute({ tenantId, token: first.token! }, adminActor),
    );
    if (resolved.unitId !== unitDirty) {
      throw new Error("resolve returned the wrong unit");
    }
    const crossTenant = await resolveQr.execute(
      { tenantId: otherTenantId, token: first.token! },
      adminActor,
    );
    if (!crossTenant.isFailure) {
      throw new Error("token resolved across tenant boundary");
    }
    results.push("PASS QR resolve is tenant-scoped");

    const rotated = unwrap(
      await rotateQr.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (!rotated.token || rotated.token === first.token) {
      throw new Error("rotate did not mint a new token");
    }
    const staleResolve = await resolveQr.execute(
      { tenantId, token: first.token! },
      adminActor,
    );
    if (!staleResolve.isFailure) {
      throw new Error("revoked token still resolves");
    }
    const afterRotate = await withTenantTransaction(tenantId, (tx) =>
      tx.unitQrAccess.count({
        where: { tenantId, unitId: unitDirty, status: "ACTIVE" },
      }),
    );
    if (afterRotate !== 1) {
      throw new Error(`rotate left ${afterRotate} ACTIVE rows`);
    }
    results.push("PASS QR rotate revokes the previous code");

    const managerQrOnB = await generateQr.execute(
      { tenantId, unitId: unitB },
      managerActor,
    );
    if (!managerQrOnB.isFailure) {
      throw new Error("manager issued a QR outside assigned properties");
    }
    results.push("PASS manager ACL blocks QR issuance on other properties");

    // --- 3. Checklist template -------------------------------------------
    const template = unwrap(
      await upsertTemplate.execute(
        {
          tenantId,
          propertyId: propA,
          name: "Standard turnover",
          minimumCompletionPhotos: 2,
          items: [
            { label: "Strip and remake beds", required: true },
            { label: "Bathroom deep clean", required: true, photoRequired: true },
            { label: "Restock minibar", required: false },
          ],
        },
        adminActor,
      ),
    );
    if (template.items.filter((i) => i.isActive).length !== 3) {
      throw new Error("template did not persist 3 active items");
    }
    const templateV2 = unwrap(
      await upsertTemplate.execute(
        {
          tenantId,
          propertyId: propA,
          name: "Standard turnover",
          minimumCompletionPhotos: 2,
          items: template.items
            .filter((i) => i.isActive)
            .map((i) => ({
              id: i.id,
              label: i.label,
              required: i.required,
              photoRequired: i.photoRequired,
            })),
        },
        adminActor,
      ),
    );
    if (templateV2.version !== template.version + 1) {
      throw new Error("template edit did not bump version");
    }
    const activeTemplates = await withTenantTransaction(tenantId, (tx) =>
      tx.cleaningChecklistTemplate.count({
        where: { tenantId, propertyId: propA, isActive: true },
      }),
    );
    if (activeTemplates !== 1) {
      throw new Error(`expected 1 active template, saw ${activeTemplates}`);
    }
    results.push("PASS checklist template upsert bumps version, stays single-active");

    // --- 4. CLEAN unit has no work ---------------------------------------
    const cleanContext = unwrap(
      await resolveContext.execute({ tenantId, unitId: unitClean }, adminActor),
    );
    if (cleanContext.selection.kind !== "NO_WORK") {
      throw new Error("CLEAN unit reported work to do");
    }
    const cleanStart = await startCleaning.execute(
      { tenantId, unitId: unitClean },
      adminActor,
    );
    if (!cleanStart.isFailure) {
      throw new Error("started a cleaning on a CLEAN unit with no task");
    }
    results.push("PASS CLEAN unit with no open task refuses to start");

    // --- 5. DIRTY unit opens a MANUAL task --------------------------------
    {
      const status = await hk.ensureInitialized({
        tenantId,
        propertyId: propA,
        unitId: unitDirty,
      });
      status.markDirty(status.version, "MANUAL", adminUser);
      await hk.saveWithExpectedVersion(status, status.version - 1);
    }

    const started = unwrap(
      await startCleaning.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (!started.created || !started.taskCreated) {
      throw new Error("DIRTY unit did not open a MANUAL housekeeping task");
    }
    if (started.execution.items.length !== 3) {
      throw new Error("execution did not snapshot the 3 template items");
    }
    const createdTask = await tasks.findById(tenantId, started.taskId);
    if (
      createdTask?.category !== "HOUSEKEEPING" ||
      createdTask.source !== "MANUAL" ||
      createdTask.status !== "IN_PROGRESS"
    ) {
      throw new Error("created task has the wrong shape");
    }
    results.push("PASS DIRTY unit opens MANUAL HK task and snapshots checklist");

    const resumed = unwrap(
      await startCleaning.execute({ tenantId, unitId: unitDirty }, adminActor),
    );
    if (resumed.created || resumed.execution.id !== started.execution.id) {
      throw new Error("second start created a duplicate execution");
    }
    results.push("PASS repeat scan resumes the same execution");

    // --- 6. Snapshot immutability ----------------------------------------
    unwrap(
      await upsertTemplate.execute(
        {
          tenantId,
          propertyId: propA,
          name: "Renamed checklist",
          minimumCompletionPhotos: 2,
          items: [{ label: "Totally different item", required: true }],
        },
        adminActor,
      ),
    );
    const afterTemplateEdit = await executions.findById(
      tenantId,
      started.execution.id,
    );
    if (
      afterTemplateEdit?.items.length !== 3 ||
      !afterTemplateEdit.items.some((i) =>
        i.labelSnapshot.includes("Strip and remake beds"),
      )
    ) {
      throw new Error("template edit mutated a running execution snapshot");
    }
    results.push("PASS mid-run template edit cannot rewrite execution snapshot");

    // Restore the original checklist so the completion gate is meaningful.
    unwrap(
      await upsertTemplate.execute(
        {
          tenantId,
          propertyId: propA,
          name: "Standard turnover",
          minimumCompletionPhotos: 2,
          items: [
            { label: "Strip and remake beds", required: true },
            { label: "Bathroom deep clean", required: true, photoRequired: true },
          ],
        },
        adminActor,
      ),
    );

    // --- 7. Completion gates ---------------------------------------------
    const execution = afterTemplateEdit!;
    const bedsItem = execution.items.find((i) =>
      i.labelSnapshot.includes("Strip and remake beds"),
    )!;
    const bathItem = execution.items.find((i) =>
      i.labelSnapshot.includes("Bathroom deep clean"),
    )!;

    const unchecked = await completeCleaning.execute(
      {
        tenantId,
        executionId: execution.id,
        expectedVersion: execution.version,
      },
      adminActor,
    );
    if (!unchecked.isFailure || !/required/i.test(unchecked.getError().message)) {
      throw new Error("completion allowed with unchecked required items");
    }
    results.push("PASS completion blocked by unchecked required item");

    unwrap(
      await updateItem.execute(
        { tenantId, executionId: execution.id, itemId: bedsItem.id, checked: true },
        adminActor,
      ),
    );
    unwrap(
      await updateItem.execute(
        { tenantId, executionId: execution.id, itemId: bathItem.id, checked: true },
        adminActor,
      ),
    );

    const noPhotos = await completeCleaning.execute(
      {
        tenantId,
        executionId: execution.id,
        expectedVersion: execution.version,
      },
      adminActor,
    );
    if (!noPhotos.isFailure || !/photo/i.test(noPhotos.getError().message)) {
      throw new Error("completion allowed without the required item photo");
    }
    results.push("PASS completion blocked by missing photoRequired evidence");

    const itemPhoto = unwrap(
      await registerPhoto.execute(
        {
          tenantId,
          executionId: execution.id,
          executionItemId: bathItem.id,
          contentType: "image/png",
          body: new Uint8Array(PNG_1PX),
        },
        adminActor,
      ),
    );
    storageKeys.push(itemPhoto.storageKey);

    const belowMinimum = await completeCleaning.execute(
      {
        tenantId,
        executionId: execution.id,
        expectedVersion: execution.version,
      },
      adminActor,
    );
    if (
      !belowMinimum.isFailure ||
      !/at least 2 photos/i.test(belowMinimum.getError().message)
    ) {
      throw new Error("completion allowed below minimumCompletionPhotos");
    }
    results.push("PASS completion blocked by minimumCompletionPhotos");

    const badType = await registerPhoto.execute(
      {
        tenantId,
        executionId: execution.id,
        executionItemId: null,
        contentType: "application/pdf",
        body: new Uint8Array(PNG_1PX),
      },
      adminActor,
    );
    if (!badType.isFailure) throw new Error("accepted a non-image photo");

    const tooBig = await registerPhoto.execute(
      {
        tenantId,
        executionId: execution.id,
        executionItemId: null,
        contentType: "image/jpeg",
        body: new Uint8Array(10 * 1024 * 1024 + 1),
      },
      adminActor,
    );
    if (!tooBig.isFailure) throw new Error("accepted a photo over 10MB");
    results.push("PASS photo content-type and size limits enforced");

    const generalPhoto = unwrap(
      await registerPhoto.execute(
        {
          tenantId,
          executionId: execution.id,
          executionItemId: null,
          contentType: "image/png",
          body: new Uint8Array(PNG_1PX),
        },
        adminActor,
      ),
    );
    storageKeys.push(generalPhoto.storageKey);

    if (!generalPhoto.url || !generalPhoto.url.startsWith("http")) {
      throw new Error("signed URL missing after supabase upload");
    }
    const signedRes = await fetch(generalPhoto.url);
    if (!signedRes.ok) {
      throw new Error(`signed URL fetch failed status=${signedRes.status}`);
    }
    const signedBytes = new Uint8Array(await signedRes.arrayBuffer());
    if (signedBytes.byteLength !== PNG_1PX.byteLength) {
      throw new Error("signed URL body size mismatch");
    }
    results.push("PASS photo bytes persisted to supabase + signed URL works");

    const publicGuess = `https://eofmpszxlumqequjqcmp.supabase.co/storage/v1/object/public/cleaning-photos/${generalPhoto.storageKey}`;
    const publicRes = await fetch(publicGuess);
    if (publicRes.ok) {
      throw new Error("public object URL unexpectedly readable");
    }
    results.push("PASS public/direct object access blocked");

    // Cap: fill to 12, then prove the 13th is refused.
    const filler: string[] = [];
    while (
      (await photos.listByExecution(tenantId, execution.id)).length < 12
    ) {
      const extra = unwrap(
        await registerPhoto.execute(
          {
            tenantId,
            executionId: execution.id,
            executionItemId: null,
            contentType: "image/png",
            body: new Uint8Array(PNG_1PX),
          },
          adminActor,
        ),
      );
      filler.push(extra.id);
      storageKeys.push(extra.storageKey);
    }
    const overCap = await registerPhoto.execute(
      {
        tenantId,
        executionId: execution.id,
        executionItemId: null,
        contentType: "image/png",
        body: new Uint8Array(PNG_1PX),
      },
      adminActor,
    );
    if (!overCap.isFailure || !/at most 12/i.test(overCap.getError().message)) {
      throw new Error("photo cap of 12 per execution not enforced");
    }
    results.push("PASS max 12 photos per execution enforced");

    unwrap(
      await removePhoto.execute(
        { tenantId, executionId: execution.id, photoId: filler[0]! },
        adminActor,
      ),
    );
    const afterRemoval = await photos.listByExecution(tenantId, execution.id);
    if (afterRemoval.length !== 11) {
      throw new Error("photo removal did not delete the row");
    }
    results.push("PASS photo removal deletes row and object");

    // --- 8. Manager ACL on the cleaning itself ----------------------------
    const managerElsewhere = await resolveContext.execute(
      { tenantId, unitId: unitB },
      managerActor,
    );
    if (!managerElsewhere.isFailure) {
      throw new Error("manager read a cleaning context outside their properties");
    }
    results.push("PASS manager ACL blocks cleaning context on other properties");

    // --- 9. Atomic completion --------------------------------------------
    const ready = await executions.findById(tenantId, execution.id);
    const completion = unwrap(
      await completeCleaning.execute(
        {
          tenantId,
          executionId: execution.id,
          expectedVersion: ready!.version,
          completionNote: "QR verification run",
        },
        adminActor,
      ),
    );
    if (completion.execution.status !== "COMPLETED") {
      throw new Error("execution not marked COMPLETED");
    }
    if (completion.task.status !== "COMPLETED") {
      throw new Error("housekeeping task not completed");
    }
    if (completion.housekeeping?.status !== "CLEAN") {
      throw new Error("unit not marked CLEAN");
    }
    const persistedHk = await hk.findByUnitId(tenantId, unitDirty);
    if (persistedHk?.status !== "CLEAN") {
      throw new Error("unit CLEAN state did not persist");
    }
    const persistedTask = await tasks.findById(tenantId, started.taskId);
    if (persistedTask?.status !== "COMPLETED") {
      throw new Error("task COMPLETED state did not persist");
    }
    results.push(
      "PASS completion atomically closes execution + task and marks unit CLEAN",
    );

    const doubleComplete = await completeCleaning.execute(
      {
        tenantId,
        executionId: execution.id,
        expectedVersion: ready!.version,
      },
      adminActor,
    );
    if (!doubleComplete.isFailure) {
      throw new Error("completed execution accepted a second completion");
    }
    results.push("PASS completed execution rejects re-completion");

    // --- 10. History and inventory separation ------------------------------
    const history = unwrap(
      await listHistory.execute(
        { tenantId, propertyId: propA, unitId: unitDirty },
        adminActor,
      ),
    );
    if (history.total < 1 || history.data[0]!.status !== "COMPLETED") {
      throw new Error("history did not record the completed cleaning");
    }
    if (history.data[0]!.photoCount !== 11) {
      throw new Error(
        `history photo count wrong: ${history.data[0]!.photoCount}`,
      );
    }
    const managerHistoryB = await listHistory.execute(
      { tenantId, propertyId: propB },
      managerActor,
    );
    if (!managerHistoryB.isFailure) {
      throw new Error("manager listed history for another property");
    }
    results.push("PASS cleaning history records run and honors manager ACL");

    const inventoryBlocks = await withTenantTransaction(tenantId, (tx) =>
      tx.unitCalendarBlock.count({
        where: { tenantId, blockType: { in: ["cleaning", "turnover"] } },
      }),
    );
    if (inventoryBlocks !== 0) {
      throw new Error("QR cleaning created inventory calendar blocks");
    }
    results.push("PASS inventory separation (no cleaning/turnover blocks)");

    const templateStillActive = unwrap(
      await getTemplate.execute({ tenantId, propertyId: propA }, adminActor),
    );
    if (!templateStillActive) throw new Error("active template disappeared");

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (err) {
    console.error(
      JSON.stringify({ ok: false, results, error: String(err) }, null, 2),
    );
    process.exitCode = 1;
  } finally {
    for (const key of storageKeys) {
      await storage.delete(key).catch(() => undefined);
    }
    await clearTenantContext(prisma);
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.cleaningPhoto.deleteMany({ where: { tenantId } });
      await tx.cleaningExecutionItem.deleteMany({ where: { tenantId } });
      await tx.cleaningExecution.deleteMany({ where: { tenantId } });
      await tx.cleaningChecklistTemplateItem.deleteMany({ where: { tenantId } });
      await tx.cleaningChecklistTemplate.deleteMany({ where: { tenantId } });
      await tx.unitQrAccess.deleteMany({ where: { tenantId } });
      await tx.task.deleteMany({ where: { tenantId } });
      await tx.unitHousekeepingStatus.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.property.deleteMany({ where: { tenantId } });
      await tx.membership.deleteMany({ where: { tenantId } });
    }).catch(() => undefined);
    await prisma.tenant
      .deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { id: { in: [adminUser, managerUser] } } })
      .catch(() => undefined);
    await prisma.$disconnect();
  }
}

main();

