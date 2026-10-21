import { AR_COMMON } from "./ar-common";
import { AR_PUBLIC } from "./ar-public";
import { AR_APP } from "./ar-app";
import { AR_ADMIN } from "./ar-admin";

/** Arabic dictionary keyed by the exact English UI text. */
export const AR: Record<string, string> = { ...AR_ADMIN, ...AR_PUBLIC, ...AR_APP, ...AR_COMMON };
