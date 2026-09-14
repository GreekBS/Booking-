import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/options";

const nextAuth = NextAuth(authConfig);

export const handlers = nextAuth.handlers;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = nextAuth.auth as (...args: any[]) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signIn = nextAuth.signIn as (...args: any[]) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signOut = nextAuth.signOut as (...args: any[]) => Promise<any>;
