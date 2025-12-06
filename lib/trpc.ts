import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const fromEnv = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (fromEnv) return fromEnv;

  // Fallback for local dev so the app doesn't crash if the env var is missing.
  console.warn("EXPO_PUBLIC_RORK_API_BASE_URL not set; using http://localhost:3000");
  return "http://localhost:3000";
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
