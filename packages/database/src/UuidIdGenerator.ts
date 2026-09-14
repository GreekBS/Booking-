import { randomUUID } from "crypto";
import type { IIdGenerator } from "@hcp/domain";

export class UuidIdGenerator implements IIdGenerator {
  generate(): string {
    return randomUUID();
  }
}
