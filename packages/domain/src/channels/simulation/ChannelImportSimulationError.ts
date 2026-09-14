import { ValidationError } from "../../shared/errors/DomainError";

export class ChannelImportSimulationError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}
