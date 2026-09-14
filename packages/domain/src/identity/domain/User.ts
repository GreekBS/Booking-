import { AggregateRoot } from "../../shared/kernel/Entity";
import { Email } from "../../shared/value-objects/Email";
import type { PlatformRole } from "../../shared/types/index";

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string;
  platformRole: PlatformRole | null;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserProps {
  id: string;
  email: string;
  name: string;
  passwordHash?: string | null;
  platformRole?: PlatformRole | null;
}

export class User extends AggregateRoot<UserProps> {
  private constructor(props: UserProps) {
    super(props);
  }

  get email(): Email {
    return Email.create(this.props.email);
  }

  get name(): string {
    return this.props.name;
  }

  get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  get platformRole(): PlatformRole | null {
    return this.props.platformRole;
  }

  get isSuperAdmin(): boolean {
    return this.props.platformRole === "super_admin";
  }

  get emailVerified(): Date | null {
    return this.props.emailVerified;
  }

  static create(props: CreateUserProps): User {
    const now = new Date();
    Email.create(props.email);

    return new User({
      id: props.id,
      email: props.email.trim().toLowerCase(),
      passwordHash: props.passwordHash ?? null,
      name: props.name.trim(),
      platformRole: props.platformRole ?? null,
      emailVerified: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  updateName(name: string): void {
    this.props.name = name.trim();
    this.props.updatedAt = new Date();
  }

  setPasswordHash(hash: string): void {
    this.props.passwordHash = hash;
    this.props.updatedAt = new Date();
  }

  verifyEmail(): void {
    this.props.emailVerified = new Date();
    this.props.updatedAt = new Date();
  }

  toProps(): UserProps {
    return { ...this.props };
  }
}
