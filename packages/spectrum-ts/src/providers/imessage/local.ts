import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  IMessageSDK,
  Message as LocalIMessage,
} from "@photon-ai/imessage-kit";
import type { Content } from "../../types/content";
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
  content: Content
) => {
  switch (content.type) {
    case "plain_text":
      await client.send(spaceId, content.text);
      break;
    case "image": {
      const tmp = join(tmpdir(), `spectrum-${Date.now()}.jpg`);
      await writeFile(tmp, content.data);
      try {
        await client.send(spaceId, { images: [tmp] });
      } finally {
        await unlink(tmp).catch(() => {});
      }
      break;
    }
    default:
      break;
  }
};
