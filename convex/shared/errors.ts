// CONTRACT (milestone 1). Clients switch on `data.code`, never on message text.
import { ConvexError } from "convex/values";

export const ERROR_CODES = [
  "FULL",         // party already has `size` members
  "BAD_STATUS",   // the party is not in the status this call needs (client: ignore, the subscription will route)
  "NOT_MEMBER",   // caller is not in this party
  "NOT_HOST",     // caller's device is not the party's host device
  "UNSAFE",       // item fails allergy/diet checks for the user(s); `reasons` explains
  "NOT_FOUND",    // party, user, item or line does not exist
  "INVALID",      // malformed input (bad join code, empty name, ...)
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorData = { code: ErrorCode; message: string; reasons?: string[] };

export function fail(code: ErrorCode, message: string, reasons?: string[]): never {
  const data: ErrorData = reasons ? { code, message, reasons } : { code, message };
  throw new ConvexError(data);
}
