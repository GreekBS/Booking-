import { describe, it, expect, beforeEach } from "vitest";
import {
  Guest,
  ResolveOrCreateGuest,
  normalizeEmail,
  normalizePhone,
  normalizeCountry,
  namesAreCompatible,
  PermissionChecker,
  type ActorContext,
  type IGuestRepository,
  type GuestIdentityLockKind,
} from "../../src";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const adminActor: ActorContext = {
  userId: "admin-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

describe("guestNormalization", () => {
  it("lowercases and trims email", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("rejects placeholder @invalid.talos.local", () => {
    expect(normalizeEmail("booking-com-guest@invalid.talos.local")).toBeNull();
    expect(normalizeEmail("x@invalid.talos.local")).toBeNull();
  });

  it("normalizes phone conservatively without inventing country code", () => {
    expect(normalizePhone("+30 210 123 4567")).toBe("+302101234567");
    expect(normalizePhone("210-123-4567")).toBe("2101234567");
    expect(normalizePhone("12")).toBeNull();
  });

  it("normalizes ISO country only", () => {
    expect(normalizeCountry("gr")).toBe("GR");
    expect(normalizeCountry("Greece")).toBeNull();
  });

  it("namesAreCompatible requires shared evidence", () => {
    expect(namesAreCompatible("John Smith", "john smith")).toBe(true);
    expect(namesAreCompatible("Alice", "Bob")).toBe(false);
    expect(namesAreCompatible("George Papadopoulos", "G Papadopoulos")).toBe(
      true,
    );
  });
});

describe("Guest entity", () => {
  it("creates with normalized contact fields", () => {
    const g = Guest.create({
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: TENANT,
      displayName: "Alice Demo",
      email: "Alice@Demo.Test",
      phone: "+30 694 000 1111",
      country: "gr",
    });
    expect(g.emailNormalized).toBe("alice@demo.test");
    expect(g.phoneNormalized).toBe("+306940001111");
    expect(g.toProps().country).toBe("GR");
    expect(g.isActive).toBe(true);
  });

  it("stores placeholder email as display but null normalized", () => {
    const g = Guest.create({
      id: "11111111-1111-4111-8111-111111111112",
      tenantId: TENANT,
      displayName: "OTA Guest",
      email: "booking-com-guest@invalid.talos.local",
    });
    expect(g.email).toBe("booking-com-guest@invalid.talos.local");
    expect(g.emailNormalized).toBeNull();
  });

  it("archive is idempotent", () => {
    const g = Guest.create({
      id: "11111111-1111-4111-8111-111111111113",
      tenantId: TENANT,
      displayName: "Archivable",
    });
    g.archive(new Date("2026-01-01T00:00:00Z"));
    expect(g.archivedAt).not.toBeNull();
    g.archive(new Date("2026-02-01T00:00:00Z"));
    expect(g.archivedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("ResolveOrCreateGuest decision table", () => {
  const store = new Map<string, ReturnType<typeof Guest.create>>();
  let idSeq = 0;

  const repo: IGuestRepository = {
    async save(guest) {
      store.set(guest.id, guest);
    },
    async findById(_t, id) {
      return store.get(id) ?? null;
    },
    async findActiveByEmailNormalized(_t, emailNormalized) {
      return [...store.values()].filter(
        (g) =>
          g.isActive && g.emailNormalized === emailNormalized,
      );
    },
    async findActiveByPhoneNormalized(_t, phoneNormalized) {
      return [...store.values()].filter(
        (g) =>
          g.isActive && g.phoneNormalized === phoneNormalized,
      );
    },
    async withIdentityLock(_t, _k: GuestIdentityLockKind, _key, fn) {
      return fn();
    },
    async linkBookingGuestIfUnlinked() {
      return { linked: true, alreadyLinked: false };
    },
    async findBookingGuestLink() {
      return { guestId: null };
    },
  };

  const ids = {
    generate: () => {
      idSeq += 1;
      return `00000000-0000-4000-8000-${String(idSeq).padStart(12, "0")}`;
    },
  };

  const useCase = new ResolveOrCreateGuest(
    repo,
    ids,
    new PermissionChecker(),
  );

  beforeEach(() => {
    store.clear();
    idSeq = 0;
  });

  it("same email + compatible name → MATCHED", async () => {
    const first = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Alice Demo",
          email: "alice@demo.test",
          phone: null,
        },
      },
      adminActor,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue().outcome).toBe("CREATED");

    const second = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Alice Demo",
          email: "alice@demo.test",
        },
      },
      adminActor,
    );
    expect(second.getValue().outcome).toBe("MATCHED");
    expect(second.getValue().guest.id).toBe(first.getValue().guest.id);
  });

  it("same email + conflicting names → AMBIGUOUS (separate Guest)", async () => {
    await useCase.execute(
      {
        tenantId: TENANT,
        contact: { displayName: "Alice", email: "family@demo.test" },
      },
      adminActor,
    );
    const second = await useCase.execute(
      {
        tenantId: TENANT,
        contact: { displayName: "Bob", email: "family@demo.test" },
      },
      adminActor,
    );
    expect(second.getValue().outcome).toBe("AMBIGUOUS");
    expect(second.getValue().createdDueToAmbiguity).toBe(true);
    expect(store.size).toBe(2);
  });

  it("placeholder email never matches → CREATED each time", async () => {
    const a = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Guest A",
          email: "booking-com-guest@invalid.talos.local",
        },
      },
      adminActor,
    );
    const b = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Guest B",
          email: "booking-com-guest@invalid.talos.local",
        },
      },
      adminActor,
    );
    expect(a.getValue().outcome).toBe("CREATED");
    expect(b.getValue().outcome).toBe("CREATED");
    expect(a.getValue().guest.id).not.toBe(b.getValue().guest.id);
  });

  it("name-only never matches → CREATED", async () => {
    await useCase.execute(
      {
        tenantId: TENANT,
        contact: { displayName: "Same Name", email: null, phone: null },
      },
      adminActor,
    );
    const second = await useCase.execute(
      {
        tenantId: TENANT,
        contact: { displayName: "Same Name", email: null, phone: null },
      },
      adminActor,
    );
    expect(second.getValue().outcome).toBe("CREATED");
    expect(store.size).toBe(2);
  });

  it("same phone + conflicting identity → AMBIGUOUS", async () => {
    await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Alice",
          phone: "+306940001111",
        },
      },
      adminActor,
    );
    const second = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Bob",
          phone: "+306940001111",
        },
      },
      adminActor,
    );
    expect(second.getValue().outcome).toBe("AMBIGUOUS");
    expect(store.size).toBe(2);
  });

  it("same email + conflicting phones → AMBIGUOUS", async () => {
    await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Alice Demo",
          email: "alice@demo.test",
          phone: "+306940001111",
        },
      },
      adminActor,
    );
    const second = await useCase.execute(
      {
        tenantId: TENANT,
        contact: {
          displayName: "Alice Demo",
          email: "alice@demo.test",
          phone: "+306940009999",
        },
      },
      adminActor,
    );
    expect(second.getValue().outcome).toBe("AMBIGUOUS");
    expect(store.size).toBe(2);
  });

  it("forbids actor without guest create", async () => {
    const manager: ActorContext = {
      userId: "m1",
      role: "manager",
      propertyIds: ["44444444-4444-4444-8444-444444444444"],
      isSuperAdmin: false,
    };
    const result = await useCase.execute(
      {
        tenantId: TENANT,
        contact: { displayName: "X", email: "x@demo.test" },
      },
      manager,
    );
    expect(result.isFailure).toBe(true);
  });
});

describe("GetGuestUseCase manager privacy", () => {
  it("is covered via permission matrix — manager has GUEST_READ_ASSIGNED only", () => {
    const checker = new PermissionChecker();
    const manager: ActorContext = {
      userId: "m1",
      role: "manager",
      propertyIds: ["44444444-4444-4444-8444-444444444444"],
      isSuperAdmin: false,
    };
    expect(
      checker.hasPermission(manager, "guest:read:assigned" as never, TENANT),
    ).toBe(true);
    expect(
      checker.hasPermission(manager, "guest:read:tenant" as never, TENANT),
    ).toBe(false);
    expect(
      checker.hasPermission(manager, "guest:create:tenant" as never, TENANT),
    ).toBe(false);
  });
});
