import type { DomainEvent } from "./DomainEvent";

export abstract class Entity<T extends { id: string }> {
  protected readonly props: T;

  protected constructor(props: T) {
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  equals(other: Entity<T>): boolean {
    return this.id === other.id;
  }
}

export abstract class AggregateRoot<T extends { id: string }> extends Entity<T> {
  private _domainEvents: DomainEvent[] = [];

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
