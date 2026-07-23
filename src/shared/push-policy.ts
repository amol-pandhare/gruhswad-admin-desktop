export const pushSectionKeys = ["orders", "catalog", "menu", "operations"] as const;
export type PushSectionKey = (typeof pushSectionKeys)[number];
export type PushSectionCounts = Record<PushSectionKey, number>;

export const pushSectionLabels: Record<PushSectionKey, string> = {
  orders: "Orders",
  catalog: "Catalog",
  menu: "One-day menu",
  operations: "Operations",
};

const operationSettingKeys = new Set(["site", "operations", "service_area", "ordering_platforms", "public_location"]);

export type PushCandidate = { type: string; id: string };
export type ClassifiedPushCandidate = PushCandidate & { section: PushSectionKey | null };

export function pushSectionFor(type: string, id: string): PushSectionKey | null {
  if (type === "cloud_order_status") return "orders";
  if (type === "catalog_category" || type === "catalog_item") return "catalog";
  if (type === "publication" && id === "current") return "menu";
  if (type === "app_setting" && operationSettingKeys.has(id)) return "operations";
  return null;
}

export function emptyPushSectionCounts(): PushSectionCounts {
  return { orders: 0, catalog: 0, menu: 0, operations: 0 };
}

export function classifyPushCandidates(rows: PushCandidate[]) {
  const sections = emptyPushSectionCounts();
  const pushable: ClassifiedPushCandidate[] = [];
  const excluded: ClassifiedPushCandidate[] = [];
  for (const row of rows) {
    const candidate = { ...row, section: pushSectionFor(row.type, row.id) };
    if (candidate.section) {
      sections[candidate.section]++;
      pushable.push(candidate);
    } else excluded.push(candidate);
  }
  return { pushable, excluded, sections };
}
