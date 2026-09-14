import { ValueObject } from "../kernel/ValueObject";

export interface LocationProps {
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export class Location extends ValueObject<LocationProps> {
  private constructor(props: LocationProps) {
    super(props);
  }

  get addressLine(): string | null {
    return this.props.addressLine;
  }

  get city(): string | null {
    return this.props.city;
  }

  get region(): string | null {
    return this.props.region;
  }

  get postalCode(): string | null {
    return this.props.postalCode;
  }

  get country(): string | null {
    return this.props.country;
  }

  get latitude(): number | null {
    return this.props.latitude;
  }

  get longitude(): number | null {
    return this.props.longitude;
  }

  static create(props: LocationProps): Location {
    return new Location(props);
  }

  static empty(): Location {
    return new Location({
      addressLine: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
      latitude: null,
      longitude: null,
    });
  }
}
