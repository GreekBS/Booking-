import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Guest } from "../domain/Guest";
import {
  isUsableEmailNormalized,
  isUsablePhoneNormalized,
  namesAreCompatible,
  normalizeEmail,
  normalizePhone,
} from "../domain/guestNormalization";
import type {
  GuestContactInput,
  IGuestRepository,
} from "../ports/IGuestRepository";

export type GuestResolveOutcome = "MATCHED" | "CREATED" | "AMBIGUOUS";

export interface ResolveOrCreateGuestResult {
  guest: Guest;
  outcome: GuestResolveOutcome;
  /** True when ambiguity forced a new Guest rather than linking an existing one. */
  createdDueToAmbiguity: boolean;
}

export interface ResolveOrCreateGuestCommand {
  tenantId: string;
  contact: GuestContactInput;
}

/**
 * CRM-1 identity resolution decision table (conservative):
 *
 * 1. Never match on name alone.
 * 2. Placeholder / synthetic emails are not usable identity keys.
 * 3. Email and phone are NOT unique — same email may be multiple humans.
 * 4. Usable email:
 *    - Load active Guests with same emailNormalized.
 *    - Keep candidates with compatible displayName.
 *    - Drop candidates with conflicting phone (both sides present, different).
 *    - 1 remaining + no phone conflict → MATCHED
 *    - 0 remaining → CREATED
 *    - 2+ remaining OR phone conflict on sole candidate → AMBIGUOUS → CREATED
 * 5. No usable email, usable phone: same pattern keyed by phone + name compatibility.
 * 6. No usable email/phone → CREATED.
 *
 * False duplicates preferred over false merges.
 */
export class ResolveOrCreateGuest {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ResolveOrCreateGuestCommand,
    actor: ActorContext,
  ): Promise<Result<ResolveOrCreateGuestResult, Error>> {
    try {
      const canCreate = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.GUEST_CREATE_TENANT,
        command.tenantId,
      );
      const canUpdate = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.GUEST_UPDATE_TENANT,
        command.tenantId,
      );
      // Resolve may match existing (read+link) or create — require create for CRM-1
      // system/backfill actors use admin/SA with GUEST_CREATE_TENANT.
      if (!canCreate && !canUpdate) {
        return Result.fail(new ForbiddenError());
      }

      const displayName = command.contact.displayName?.trim() ?? "";
      if (!displayName) {
        return Result.fail(new ValidationError("Guest displayName required"));
      }

      const emailNormalized = normalizeEmail(command.contact.email);
      const phoneNormalized = normalizePhone(command.contact.phone);

      if (isUsableEmailNormalized(emailNormalized)) {
        return Result.ok(
          await this.guests.withIdentityLock(
            command.tenantId,
            "email",
            emailNormalized!,
            () =>
              this.resolveLocked(
                command,
                displayName,
                emailNormalized,
                phoneNormalized,
                "email",
              ),
          ),
        );
      }

      if (isUsablePhoneNormalized(phoneNormalized)) {
        return Result.ok(
          await this.guests.withIdentityLock(
            command.tenantId,
            "phone",
            phoneNormalized!,
            () =>
              this.resolveLocked(
                command,
                displayName,
                emailNormalized,
                phoneNormalized,
                "phone",
              ),
          ),
        );
      }

      return Result.ok(await this.createNew(command, displayName, false));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveLocked(
    command: ResolveOrCreateGuestCommand,
    displayName: string,
    emailNormalized: string | null,
    phoneNormalized: string | null,
    key: "email" | "phone",
  ): Promise<ResolveOrCreateGuestResult> {
    const candidates =
      key === "email"
        ? await this.guests.findActiveByEmailNormalized(
            command.tenantId,
            emailNormalized!,
          )
        : await this.guests.findActiveByPhoneNormalized(
            command.tenantId,
            phoneNormalized!,
          );

    const compatible = candidates.filter((g) =>
      namesAreCompatible(displayName, g.displayName),
    );

    if (compatible.length === 0) {
      // Same contact key exists but names conflict → create separate Guest (false duplicate OK)
      if (candidates.length > 0) {
        return this.createNew(command, displayName, true);
      }
      return this.createNew(command, displayName, false);
    }

    if (compatible.length > 1) {
      return this.createNew(command, displayName, true);
    }

    const match = compatible[0]!;
    if (phonesConflict(phoneNormalized, match.phoneNormalized)) {
      return this.createNew(command, displayName, true);
    }
    if (
      key === "phone" &&
      emailsConflict(emailNormalized, match.emailNormalized)
    ) {
      return this.createNew(command, displayName, true);
    }

    return {
      guest: match,
      outcome: "MATCHED",
      createdDueToAmbiguity: false,
    };
  }

  private async createNew(
    command: ResolveOrCreateGuestCommand,
    displayName: string,
    createdDueToAmbiguity: boolean,
  ): Promise<ResolveOrCreateGuestResult> {
    const guest = Guest.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      displayName,
      firstName: command.contact.firstName,
      lastName: command.contact.lastName,
      email: command.contact.email,
      phone: command.contact.phone,
      country: command.contact.country,
      preferredLanguage: command.contact.preferredLanguage,
    });
    await this.guests.save(guest);
    return {
      guest,
      outcome: createdDueToAmbiguity ? "AMBIGUOUS" : "CREATED",
      createdDueToAmbiguity,
    };
  }
}

function phonesConflict(
  incoming: string | null,
  existing: string | null,
): boolean {
  if (!incoming || !existing) return false;
  return incoming !== existing;
}

function emailsConflict(
  incoming: string | null,
  existing: string | null,
): boolean {
  if (!incoming || !existing) return false;
  return incoming !== existing;
}
