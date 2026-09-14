import { ValueObject } from "../kernel/ValueObject";

export type CancellationPolicyType = "flexible" | "moderate" | "strict";

export interface PropertyPoliciesProps {
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicyType: CancellationPolicyType;
}

export class PropertyPolicies extends ValueObject<PropertyPoliciesProps> {
  private constructor(props: PropertyPoliciesProps) {
    super(props);
  }

  get checkInTime(): string {
    return this.props.checkInTime;
  }

  get checkOutTime(): string {
    return this.props.checkOutTime;
  }

  get cancellationPolicyType(): CancellationPolicyType {
    return this.props.cancellationPolicyType;
  }

  static create(props: Partial<PropertyPoliciesProps> = {}): PropertyPolicies {
    return new PropertyPolicies({
      checkInTime: props.checkInTime ?? "15:00",
      checkOutTime: props.checkOutTime ?? "11:00",
      cancellationPolicyType: props.cancellationPolicyType ?? "moderate",
    });
  }
}

export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
export type TimeFormat = "24h" | "12h";

export interface TenantSettingsProps {
  timezone: string;
  defaultLocale: string;
  defaultCurrency: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export class TenantSettings extends ValueObject<TenantSettingsProps> {
  private constructor(props: TenantSettingsProps) {
    super(props);
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get defaultLocale(): string {
    return this.props.defaultLocale;
  }

  get defaultCurrency(): string {
    return this.props.defaultCurrency;
  }

  get dateFormat(): DateFormat {
    return this.props.dateFormat;
  }

  get timeFormat(): TimeFormat {
    return this.props.timeFormat;
  }

  static create(props: Partial<TenantSettingsProps> = {}): TenantSettings {
    return new TenantSettings({
      timezone: props.timezone ?? "Europe/Athens",
      defaultLocale: props.defaultLocale ?? "en",
      defaultCurrency: props.defaultCurrency ?? "EUR",
      dateFormat: props.dateFormat ?? "DD/MM/YYYY",
      timeFormat: props.timeFormat ?? "24h",
    });
  }
}
