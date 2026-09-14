export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

export interface VerificationTokenRecord {
  identifier: string;
  token: string;
  expires: Date;
}

export interface IVerificationTokenRepository {
  create(record: VerificationTokenRecord): Promise<void>;
  find(identifier: string, token: string): Promise<VerificationTokenRecord | null>;
  delete(identifier: string, token: string): Promise<void>;
}
