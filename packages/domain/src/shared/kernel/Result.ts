export class Result<T, E = Error> {
  private constructor(
    private readonly _isSuccess: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  get isSuccess(): boolean {
    return this._isSuccess;
  }

  get isFailure(): boolean {
    return !this._isSuccess;
  }

  getValue(): T {
    if (!this._isSuccess || this._value === undefined) {
      throw new Error("Cannot get value from failed result");
    }
    return this._value;
  }

  getError(): E {
    if (this._isSuccess || this._error === undefined) {
      throw new Error("Cannot get error from successful result");
    }
    return this._error;
  }

  static ok<T>(value: T): Result<T, never> {
    return new Result(true, value);
  }

  static fail<E>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined as never, error);
  }
}
