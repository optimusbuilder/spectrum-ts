import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";
import type { IMessageSDK } from "@photon-ai/imessage-kit";
import z from "zod";
import type { SchemaMessage } from "../../platform/types";

export type IMessageClient = IMessageSDK | AdvancedIMessage[];

const clientEntry = z.object({ address: z.string(), token: z.string() });

export const configSchema = z.object({
  local: z.boolean().optional().default(false),
  clients: clientEntry.or(z.array(clientEntry)).optional(),
});

export const userSchema = z.object({});

export const spaceSchema = z.object({
  id: z.string(),
  type: z.enum(["dm", "group"]),
});

export type IMessageMessage = SchemaMessage<
  typeof userSchema,
  typeof spaceSchema
>;
