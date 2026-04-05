import {
  chatGuid,
  createClient,
  directChat,
  groupChat,
} from "@photon-ai/advanced-imessage";
import z from "zod";
import { definePlatform } from "../platform/define";

export const imessage = definePlatform({
  name: "iMessage",

  config: z.object({
    address: z.string(),
    token: z.string(),
  }),

  events: {},

  lifecycle: {
    createClient: async ({ config }) => {
      return createClient({
        address: config.address,
        token: config.token,
      });
    },

    destroyClient: async ({ client }) => {
      await client.close();
    },

    listen: async ({ client, push }) => {
      const stream = client.messages.subscribe("message.received");
      for await (const event of stream) {
        push(event);
      }
    },
  },

  actions: {
    send: async ({ space, content, client }) => {
      const text = content
        .filter((c) => c.type === "plain_text")
        .map((c) => c.text)
        .join("\n");

      await client.messages.send(chatGuid(space.id), text);
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
