import type { NonEmptyString } from "type-fest";
import z from "zod";

const contentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plain_text"),
    text: z.string(),
  }),
]);

export type Content = z.infer<typeof contentSchema>;

export function text<T extends string>(text: NonEmptyString<T>): Content {
  return {
    type: "plain_text",
    text,
  };
}
