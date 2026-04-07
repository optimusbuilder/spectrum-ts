import {
  type AdvancedIMessage,
  chatGuid,
  createClient,
  directChat,
  groupChat,
  type MessageEvent,
} from "@photon-ai/advanced-imessage";
import { IMessageSDK } from "@photon-ai/imessage-kit";
import z from "zod";
import { definePlatform } from "../platform/define";
import type { ProviderMessage } from "../platform/types";
import { type ManagedStream, mergeStreams, stream } from "../utils/stream";

type IMessageClient = IMessageSDK | AdvancedIMessage[];
type RemoteMessageEvent = Extract<MessageEvent, { type: "message.received" }>;
type IMessageMessage = ProviderMessage<
  { id: string },
  { id: string; type: "dm" | "group" }
>;

const toIMessageMessage = (event: RemoteMessageEvent): IMessageMessage => ({
  content: [{ type: "plain_text", text: event.message.text ?? "" }],
  sender: {
    id: event.message.sender?.address ?? "",
  },
  space: {
    id: event.chatGuid,
    type: event.chatGuid.includes(";+;") ? "group" : "dm",
  },
  timestamp: event.timestamp,
});

const createLocalMessageStream = (
  client: IMessageSDK
): ManagedStream<IMessageMessage> => {
  return stream<IMessageMessage>((emit) => {
    client.startWatching({
      onMessage: (msg) => {
        emit({
          content: [{ type: "plain_text", text: msg.text ?? "" }],
          sender: {
            id: msg.sender ?? "",
          },
          space: {
            id: msg.sender ?? "",
            type: "dm",
          },
          timestamp: msg.date ?? new Date(),
        });
      },
    });

    return () => {
      client.stopWatching();
    };
  });
};

const createRemoteClientMessageStream = (
  client: AdvancedIMessage
): ManagedStream<RemoteMessageEvent> => {
  return stream<RemoteMessageEvent>((emit, end) => {
    const subscription = client.messages.subscribe("message.received");
    let closing = false;

    (async () => {
      try {
        for await (const event of subscription) {
          emit(event);
        }
        end();
      } catch (error) {
        if (closing) {
          end();
          return;
        }
        end(error);
      }
    })();

    return async () => {
      closing = true;
      await subscription.close();
    };
  });
};

const normalizeRemoteMessages = async function* (
  source: AsyncIterable<RemoteMessageEvent>
): AsyncIterable<IMessageMessage> {
  for await (const event of source) {
    yield toIMessageMessage(event);
  }
};

const createRemoteMessageStream = (
  clients: AdvancedIMessage[]
): AsyncIterable<IMessageMessage> => {
  return normalizeRemoteMessages(
    mergeStreams(clients.map(createRemoteClientMessageStream))
  );
};

export const imessage = definePlatform("iMessage", {
  config: z.union([
    z.object({
      local: z.literal(true),
    }),
    z.object({
      local: z.boolean().optional().default(false),
      clients: z
        .union([
          z.object({ address: z.string(), token: z.string() }),
          z.array(z.object({ address: z.string(), token: z.string() })),
        ])
        .optional(),
    }),
  ]),

  user: {
    resolve: async ({ input }) => ({
      id: input.userID,
    }),
  },

  space: {
    schema: z.object({
      id: z.string(),
      type: z.enum(["dm", "group"]),
    }),
    resolve: async ({ input }) => {
      if (input.users.length === 0) {
        throw new Error("iMessage space creation requires at least one user");
      }

      const type = input.users.length === 1 ? "dm" : "group";

      if (type === "dm") {
        return {
          id: directChat(input.users[0]?.id ?? "") as string,
          type: "dm",
        };
      }

      return {
        id: groupChat("") as string,
        type: "group",
      };
    },
  },

  lifecycle: {
    createClient: async ({ config }): Promise<IMessageClient> => {
      if (config.local) {
        return new IMessageSDK();
      }

      const raw = config.clients ?? [];
      const entries = Array.isArray(raw) ? raw : [raw];
      return entries.map((entry) =>
        createClient({
          address: entry.address,
          tls: true,
          token: entry.token,
        })
      );
    },

    destroyClient: async ({ client }: { client: IMessageClient }) => {
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
        return createLocalMessageStream(client);
      }

      return createRemoteMessageStream(client);
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
});
