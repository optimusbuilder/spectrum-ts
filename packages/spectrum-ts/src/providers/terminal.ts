import { createInterface } from "node:readline";
import z from "zod";
import { definePlatform } from "../platform/define";

export const terminal = definePlatform("terminal", {
  config: z.object({}),

  lifecycle: {
    createClient: async () => {
      return createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    },

    destroyClient: async ({ client }) => {
      client.close();
    },
  },

  events: {
    async *messages({ client }) {
      for await (const line of client) {
        yield {
          content: [{ type: "plain_text" as const, text: line }],
          platform: "terminal",
          raw: line,
          sender: { id: "terminal-user", __platform: "terminal" as const },
          timestamp: new Date(),
        };
      }
    },
  },

  actions: {
    send: async ({ content }) => {
      const output = content
        .filter((c) => c.type === "plain_text")
        .map((c) => c.text)
        .join("\n");

      console.log(output);
    },
  },

  user: {
    resolve: async ({ input }) => ({
      id: input.userID,
      __platform: "terminal" as const,
    }),
  },

  space: {
    resolve: async () => ({
      id: "terminal",
      __platform: "terminal" as const,
    }),
  },
});
