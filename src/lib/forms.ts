import type { ErrorKey, FieldErrors } from "@/lib/validation/auth";

/**
 * Result of a form Server Action, consumed by `useActionState`. `values` repopulates the
 * fields because React resets uncontrolled forms after an action. Never put passwords there.
 */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      error?: ErrorKey;
      fieldErrors?: FieldErrors;
      values?: Record<string, string>;
    }
  | { status: "success"; values?: Record<string, string> };

export const idle: FormState = { status: "idle" };
