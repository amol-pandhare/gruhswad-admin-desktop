import { Storage } from "@google-cloud/storage";
import { getSettings } from "./database";
import { loadStoredSecrets } from "./services";

export function gcsBucketName() { return getSettings().gcsBucket || "fb-image-store"; }
export function gcsStorage() {
  const raw = loadStoredSecrets().gcsServiceAccountJson;
  if (!raw) throw new Error("Import Google Cloud Storage credentials in Settings before uploading images.");
  let value: { project_id?: string; client_email?: string; private_key?: string };
  try { value = JSON.parse(raw); } catch { throw new Error("The saved Google Cloud service-account credentials are invalid."); }
  if (!value.project_id || !value.client_email || !value.private_key) throw new Error("The saved Google Cloud service-account credentials are invalid.");
  return new Storage({ projectId: value.project_id, credentials: { client_email: value.client_email, private_key: value.private_key } });
}
export function gcsBucket() { return gcsStorage().bucket(gcsBucketName()); }
