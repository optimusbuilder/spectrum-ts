import {
  chatGuid,
  createClient,
  directChat,
  groupChat,
} from "@photon-ai/advanced-imessage";
import { IMessageSDK } from "@photon-ai/imessage-kit";
import z from "zod";
import { definePlatform } from "../platform/define";
import { fromEmitter } from "../utils/stream";

export const imessage = definePlatform({
  name: "iMessage",

  config: z.object({
    local: z.boolean().default(false),
  }),

  lifecycle: {
    createClient: async ({ config }) => {
      if (config.local) {
        return new IMessageSDK();
      }

      return createClient({
        address: "",
        token: "",
      });
    },

    destroyClient: async ({ client }) => {
      await client.close();
    },
  },

  events: {
    messages({ client, config }) {
      if (config.local) {
        const sdk = client as IMessageSDK;
        return fromEmitter<{
          content: { type: "plain_text"; text: string }[];
          platform: "iMessage";
          raw: unknown;
          sender: { id: string; __platform: "iMessage" };
          timestamp: Date;
        }>((emit) => {
          sdk.startWatching({
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
            sdk.stopWatching();
          };
        });
      }

      // Remote mode: advanced-imessage SDK
      const remote = client as ReturnType<typeof createClient>;
      const stream = remote.messages.subscribe("message.received");
      return stream;
    },
  },

  actions: {
    send: async ({ space, content, client }) => {
      const text = content
        .filter((c) => c.type === "plain_text")
        .map((c) => c.text)
        .join("\n");

      await (client as ReturnType<typeof createClient>).messages.send(
        chatGuid(space.id),
        text
      );
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
