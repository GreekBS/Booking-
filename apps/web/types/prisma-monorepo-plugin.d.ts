declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  import type { WebpackPluginInstance } from "webpack";

  export class PrismaPlugin implements WebpackPluginInstance {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply(compiler: any): void;
  }
}
