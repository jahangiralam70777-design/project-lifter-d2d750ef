import type { ZodTypeAny, z } from "zod";

/**
 * Shared inputValidator helper for createServerFn.
 *
 * Usage:
 *   const schema = z.object({ id: z.string().uuid() });
 *   export const fn = createServerFn({ method: "POST" })
 *     .validator(validate(schema))
 *     .handler(async ({ data }) => { ... });
 *
 * Throws a ZodError on invalid input; TanStack's server-fn envelope surfaces
 * it to the caller as a normal Error so handlers never see malformed data.
 */
export const validate =
  <S extends ZodTypeAny>(schema: S) =>
  (input: unknown): z.infer<S> =>
    schema.parse(input);

/**
 * Reject any payload on server fns that take no input. Allows `undefined`
 * (no-arg call) and the empty object `{}`; throws on anything else. Use:
 *
 *   createServerFn({ method: "GET" })
 *     .middleware([requireSupabaseAuth])
 *     .validator(noInput)
 *     .handler(...)
 */
export const noInput = (input: unknown): void => {
  if (input === undefined || input === null) return;
  if (
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.keys(input as Record<string, unknown>).length === 0
  ) {
    return;
  }
  throw new Error("Unexpected input: this endpoint accepts no parameters");
};
