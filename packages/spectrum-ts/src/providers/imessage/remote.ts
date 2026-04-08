import {
  type AdvancedIMessage,
  chatGuid,
  type MessageEvent,
} from "@photon-ai/advanced-imessage";
import type { Content } from "../../types/content";
import { type ManagedStream, mergeStreams, stream } from "../../utils/stream";
import type { IMessageMessage } from "./types";

type ReceivedEvent = Extract<MessageEvent, { type: "message.received" }>;

const toMessage = (event: ReceivedEvent): IMessageMessage => ({
  content: [{ type: "plain_text", text: event.message.text ?? "" }],
  sender: { id: event.message.sender?.address ?? "" },
  space: {
    id: event.chatGuid,
    type: event.chatGuid.includes(";+;") ? "group" : "dm",
  },
  timestamp: event.timestamp,
});

const clientStream = (
  client: AdvancedIMessage
): ManagedStream<IMessageMessage> => {
  const sub = client.messages.subscribe("message.received");
  return stream<IMessageMessage>((emit, end) => {
    (async () => {
      try {
        for await (const event of sub) {
          emit(toMessage(event));
        }
        end();
      } catch (e) {
        end(e);
      }
    })();
    return () => sub.close();
  });
};

export const messages = (
  clients: AdvancedIMessage[]
): ManagedStream<IMessageMessage> => mergeStreams(clients.map(clientStream));

export const send = async (
  clients: AdvancedIMessage[],
  spaceId: string,
  content: Content
) => {
  const remote = clients[0];
  if (!remote) {
    return;
  }
  switch (content.type) {
    case "plain_text":
      await remote.messages.send(chatGuid(spaceId), content.text);
      break;
    case "image": {
      const attachment = await remote.attachments.upload({
        data: content.data,
        fileName: "image.jpg",
        mimeType: "image/jpeg",
      });
      await remote.messages.send(chatGuid(spaceId), "", {
        attachment: attachment.guid,
      });
      break;
    }
    default:
      break;
  }
};
