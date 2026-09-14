import { ValidationError } from "../../shared/errors/DomainError";

export class ChannelProviderRegistrationError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}
