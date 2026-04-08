import type {
  IMessageSDK,
  Message as LocalIMessage,
} from "@photon-ai/imessage-kit";
import { type ManagedStream, stream } from "../../utils/stream";
import type { IMessageMessage } from "./types";

const toSpace = (message: LocalIMessage): IMessageMessage["space"] => ({
  id: `${message.isGroupChat ? "any;+;" : "any;-;"}${message.chatId}`,
  type: message.isGroupChat ? "group" : "dm",
});

const toMessage = (message: LocalIMessage): IMessageMessage => ({
  content: [{ type: "plain_text", text: message.text ?? "" }],
  sender: { id: message.sender ?? "" },
  space: toSpace(message),
  timestamp: message.date ?? new Date(),
});

export const messages = (client: IMessageSDK): ManagedStream<IMessageMessage> =>
  stream((emit) => {
    client.startWatching({
      onMessage: (message) => emit(toMessage(message)),
    });
    return () => client.stopWatching();
  });

export const send = async (
  client: IMessageSDK,
  spaceId: string,
  text: string
) => {
  await client.send(spaceId, text);
};
