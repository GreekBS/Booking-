import type { IBackgroundJobHandler } from "../ports/IBackgroundJobHandler";

export class JobHandlerRegistry {
  private readonly handlers: IBackgroundJobHandler[] = [];

  register(handler: IBackgroundJobHandler): void {
    this.handlers.push(handler);
  }

  resolve(jobType: string): IBackgroundJobHandler | undefined {
    return this.handlers.find((handler) => handler.canHandle(jobType));
  }
}
