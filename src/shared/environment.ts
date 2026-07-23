import { z } from "zod";

export const runtimeEnvironmentSchema = z.enum(["local", "prod"]);
export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;
export type DatabaseConnectionSource = "settings" | "environment-local" | "environment-prod" | "legacy" | "none";
export type DatabaseConnectionInfo = { environment: RuntimeEnvironment; source: DatabaseConnectionSource; configured: boolean; error?: string };
export type ResolvedDatabaseConnection = DatabaseConnectionInfo & { url: string };

type ResolveInput = { processEnv?: Record<string, string | undefined>; fileEnv?: Record<string, string | undefined>; storedUrl?: string };

export function resolveDatabaseConnection(input: ResolveInput): ResolvedDatabaseConnection {
  const processEnv = input.processEnv ?? {};
  const fileEnv = input.fileEnv ?? {};
  const selected = processEnv.APP_ENV ?? fileEnv.APP_ENV ?? "local";
  const environment = runtimeEnvironmentSchema.parse(selected);
  const storedUrl = input.storedUrl?.trim();
  if (storedUrl) return { environment, source: "settings", configured: true, url: storedUrl };
  const selectedKey = environment === "local" ? "DATABASE_URL_LOCAL" : "DATABASE_URL_PROD";
  const environmentUrl = (processEnv[selectedKey] ?? fileEnv[selectedKey])?.trim();
  if (environmentUrl) return { environment, source: `environment-${environment}` as const, configured: true, url: environmentUrl };
  const legacyUrl = (processEnv.DATABASE_URL ?? fileEnv.DATABASE_URL)?.trim();
  if (legacyUrl) return { environment, source: "legacy", configured: true, url: legacyUrl };
  return { environment, source: "none", configured: false, url: "" };
}
