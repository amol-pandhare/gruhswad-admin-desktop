import type { SyncAttentionStatus } from "./contracts";

export type ExitWarningCopy = {
  title: string;
  message: string;
  detail: string;
};

export function syncAttentionFromCounts(conflicts: number, pushableDirty: number): SyncAttentionStatus {
  return { conflicts, pushableDirty, requiresAttention: conflicts > 0 || pushableDirty > 0 };
}

export function exitWarningCopy(attention: SyncAttentionStatus | null): ExitWarningCopy {
  if (!attention) return {
    title: "Sync status could not be verified",
    message: "Gruhswad could not verify whether local changes are synchronized.",
    detail: "Open Sync Centre to check the cloud status, or exit anyway. Your local records will be preserved.",
  };
  if (attention.conflicts > 0) return {
    title: "Unresolved sync conflicts",
    message: `${attention.conflicts} sync conflict${attention.conflicts === 1 ? " requires" : "s require"} your attention.`,
    detail: "Review the conflicts in Sync Centre before updating Neon, or exit anyway. Your local records will be preserved.",
  };
  return {
    title: "Cloud update pending",
    message: `${attention.pushableDirty} local change${attention.pushableDirty === 1 ? " has" : "s have"} not been uploaded to Neon.`,
    detail: "Open Sync Centre to update the cloud database, or exit anyway. Your local records will be preserved.",
  };
}
