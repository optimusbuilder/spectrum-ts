import {
  type AdvancedIMessage,
  chatGuid,
  createClient,
  directChat,
  groupChat,
} from "@photon-ai/advanced-imessage";
import { IMessageSDK } from "@photon-ai/imessage-kit";
import z from "zod";
import { definePlatform } from "../platform/define";
import { channel, fromEmitter } from "../utils/stream";

type IMessageClient = IMessageSDK | AdvancedIMessage[];

export const imessage = definePlatform({
  name: "iMessage",

  config: z.discriminatedUnion("local", [
    z.object({
      local: z.literal(true),
    }),
    z.object({
      local: z.literal(false).default(false),
      clients: z
        .union([
          z.object({ address: z.string(), token: z.string() }),
          z.array(z.object({ address: z.string(), token: z.string() })),
        ])
        .optional(),
    }),
  ]),

  lifecycle: {
    createClient: async ({ config }): Promise<IMessageClient> => {
      if (config.local) {
        return new IMessageSDK();
      }

      const raw = config.clients ?? [];
      const entries = Array.isArray(raw) ? raw : [raw];
      return entries.map((entry) =>
        createClient({ address: entry.address, token: entry.token })
      );
    },

    destroyClient: async ({ client }) => {
      if (client instanceof IMessageSDK) {
        await client.close();
        return;
      }

      for (const remote of client) {
        await remote.close();
      }
    },
  },

  events: {
    messages({ client }) {
      if (client instanceof IMessageSDK) {
        return fromEmitter<{
          content: { type: "plain_text"; text: string }[];
          platform: "iMessage";
          raw: unknown;
          sender: { id: string; __platform: "iMessage" };
          timestamp: Date;
        }>((emit) => {
          client.startWatching({
            onMessage: (msg) => {
              emit({
                content: [{ type: "plain_text", text: msg.text ?? "" }],
                platform: "iMessage",
                raw: msg,
                sender: {
                  id: msg.sender ?? "",
                  __platform: "iMessage",
                },
                timestamp: msg.date ?? new Date(),
              });
            },
          });
          return () => {
            client.stopWatching();
          };
        });
      }

      // Remote mode: merge message streams from all clients
      const merged = channel<{
        content: { type: "plain_text"; text: string }[];
        platform: "iMessage";
        raw: unknown;
        sender: { id: string; __platform: "iMessage" };
        timestamp: Date;
      }>();

      for (const remote of client) {
        const stream = remote.messages.subscribe("message.received");
        (async () => {
          for await (const event of stream) {
            const msg = event.message;
            merged.push({
              content: [{ type: "plain_text", text: msg?.text ?? "" }],
              platform: "iMessage",
              raw: event,
              sender: {
                id: msg?.sender?.address ?? "",
                __platform: "iMessage",
              },
              timestamp: event.timestamp,
            });
          }
        })();
      }

      return merged.iterable;
    },
  },

  actions: {
    send: async ({ space, content, client }) => {
      const text = content
        .filter((c) => c.type === "plain_text")
        .map((c) => c.text)
        .join("\n");

      if (client instanceof IMessageSDK) {
        await client.send(space.id, text);
        return;
      }

      // Send via first available remote client
      const remote = client[0];
      if (remote) {
        await remote.messages.send(chatGuid(space.id), text);
      }
    },
  },

  user: {
    resolve: async ({ input }) => ({
      id: input.userID,
      __platform: "iMessage" as const,
    }),
  },

  space: {
    schema: z.object({
      type: z.enum(["dm", "group"]),
    }),
    resolve: async ({ input }) => {
      const id =
        input.options.type === "dm"
          ? directChat(input.users[0]?.id ?? "")
          : groupChat("");
      return { id: id as string, __platform: "iMessage" as const };
    },
  },
});
