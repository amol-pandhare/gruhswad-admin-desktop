import type { AdminApi } from "../shared/contracts";
declare global { interface Window { admin: AdminApi } }
export {};
