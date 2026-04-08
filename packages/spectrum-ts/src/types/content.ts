import type { NonEmptyString } from "type-fest";
import z from "zod";

const contentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plain_text"),
    text: z.string().nonempty(),
  }),
  z.object({
    type: z.literal("custom"),
    raw: z.json(),
  }),
]);

export type Content = z.infer<typeof contentSchema>;

export function text<T extends string>(text: NonEmptyString<T>): Content {
  return {
    type: "plain_text",
    text,
  };
}

export function custom(raw: z.infer<ReturnType<typeof z.json>>): Content {
  return {
    type: "custom",
    raw,
  };
}
