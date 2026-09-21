import { Result } from "../../shared/kernel/Result";
import type {
  IPlatformAuditRepository,
  PlatformSystemConfiguration,
} from "../ports/IPlatformAuditRepository";

export class GetPlatformSystemConfigurationUseCase {
  constructor(private readonly audit: IPlatformAuditRepository) {}

  async execute(): Promise<Result<PlatformSystemConfiguration, Error>> {
    try {
      return Result.ok(await this.audit.getSystemConfiguration());
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
