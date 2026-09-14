import { Result } from "../../shared/kernel/Result";
import { Email } from "../../shared/value-objects/Email";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import { User } from "../domain/User";
import type { IUserRepository } from "../ports/IdentityRepositories";
import type {
  IPasswordHasher,
  IVerificationTokenRepository,
} from "../ports/AuthPorts";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";

export interface RegisterUserCommand {
  email: string;
  name: string;
  password: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly verificationTokenRepository: IVerificationTokenRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly generateToken: () => string,
  ) {}

  async execute(
    command: RegisterUserCommand,
  ): Promise<Result<{ userId: string; verificationToken: string }, Error>> {
    try {
      const email = Email.create(command.email).value;
      const existing = await this.userRepository.findByEmail(email);
      if (existing) {
        return Result.fail(new ConflictError("Email already registered"));
      }

      const name = command.name.trim();
      if (name.length < 2) {
        return Result.fail(new ValidationError("Name is required"));
      }

      if (command.password.length < 8) {
        return Result.fail(new ValidationError("Password must be at least 8 characters"));
      }

      const passwordHash = await this.passwordHasher.hash(command.password);
      const user = User.create({
        id: this.idGenerator.generate(),
        email,
        name,
        passwordHash,
      });

      await this.userRepository.save(user);

      const token = this.generateToken();
      await this.verificationTokenRepository.create({
        identifier: email,
        token,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      return Result.ok({ userId: user.id, verificationToken: token });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface RequestPasswordResetCommand {
  email: string;
}

export class RequestPasswordResetUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly verificationTokenRepository: IVerificationTokenRepository,
    private readonly generateToken: () => string,
  ) {}

  async execute(
    command: RequestPasswordResetCommand,
  ): Promise<Result<{ resetToken: string | null }, Error>> {
    try {
      const email = Email.create(command.email).value;
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return Result.ok({ resetToken: null });
      }

      const token = this.generateToken();
      await this.verificationTokenRepository.create({
        identifier: email,
        token,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      });

      return Result.ok({ resetToken: token });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ResetPasswordCommand {
  email: string;
  token: string;
  newPassword: string;
}

export class ResetPasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly verificationTokenRepository: IVerificationTokenRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<Result<void, Error>> {
    try {
      const email = Email.create(command.email).value;

      if (command.newPassword.length < 8) {
        return Result.fail(new ValidationError("Password must be at least 8 characters"));
      }

      const stored = await this.verificationTokenRepository.find(email, command.token);
      if (!stored || stored.expires < new Date()) {
        return Result.fail(new ValidationError("Invalid or expired reset token"));
      }

      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return Result.fail(new ValidationError("User not found"));
      }

      const hash = await this.passwordHasher.hash(command.newPassword);
      user.setPasswordHash(hash);
      await this.userRepository.save(user);
      await this.verificationTokenRepository.delete(email, command.token);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface VerifyEmailCommand {
  email: string;
  token: string;
}

export class VerifyEmailUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly verificationTokenRepository: IVerificationTokenRepository,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<Result<void, Error>> {
    try {
      const email = Email.create(command.email).value;
      const stored = await this.verificationTokenRepository.find(email, command.token);
      if (!stored || stored.expires < new Date()) {
        return Result.fail(new ValidationError("Invalid or expired verification token"));
      }

      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return Result.fail(new ValidationError("User not found"));
      }

      user.verifyEmail();
      await this.userRepository.save(user);
      await this.verificationTokenRepository.delete(email, command.token);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
