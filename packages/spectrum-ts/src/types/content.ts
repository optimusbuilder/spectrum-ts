import { readFile } from "node:fs/promises";
import { heifToJpeg } from "@photon-hq/heif2jpeg";
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
  z.object({
    type: z.literal("image"),
    data: z.instanceof(Buffer),
  }),
]);

export type Content = z.infer<typeof contentSchema>;

export interface ContentBuilder {
  build(): Promise<Content>;
}

export function text<T extends string>(
  text: NonEmptyString<T>
): ContentBuilder {
  return {
    build: (): Promise<Content> =>
      Promise.resolve({ type: "plain_text", text }),
  };
}

export function custom(
  raw: z.infer<ReturnType<typeof z.json>>
): ContentBuilder {
  return {
    build: (): Promise<Content> => Promise.resolve({ type: "custom", raw }),
  };
}

function isHeif(data: Uint8Array): boolean {
  if (data.length < 12) {
    return false;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(4) !== 0x66_74_79_70) {
    return false;
  }
  const brand = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  return ["heic", "heix", "hevc", "hevx", "mif1"].includes(brand);
}

export function image(
  input: string | Buffer,
  options?: { quality?: number }
): ContentBuilder {
  return {
    build: async (): Promise<Content> => {
      let data = typeof input === "string" ? await readFile(input) : input;
      if (isHeif(data)) {
        data = (await heifToJpeg(data, {
          quality: options?.quality ?? 85,
        })) as Buffer;
      }
      return { type: "image" as const, data };
    },
  };
}
