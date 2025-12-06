import { initTRPC } from "@trpc/server";
import superjson from "superjson";

// Minimal stub router so the client can typecheck; replace with real procedures when backend is ready.
// Configure transformer to match client (superjson)
const t = initTRPC.create({ transformer: superjson });

export const appRouter = t.router({});
export type AppRouter = typeof appRouter;
