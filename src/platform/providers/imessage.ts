import { IMessageSDK } from "@photon-ai/imessage-kit";
import z from "zod";
import { text } from "../../core/content";
import { Spectrum } from "../../core/spectrum";
import { definePlatform } from "../define";
import { SpaceKind } from "../type";

const imessage = definePlatform({
  name: "iMessage",
  spaces: {
    dm: {
      kind: SpaceKind.Direct,
    },
    group: {
      kind: SpaceKind.Group,
    },
  },
  defaultDirect: "dm",
  defaultGroup: "group",
  config: {
    schema: z.object({
      useLocal: z.boolean().default(false),
    }),
  },
  user: {
    schema: z.object({}),
    resolve: async ({ input }) => {
      return {
        id: input.userID,
      };
    },
  },
  space: {
    schema: z.object({}),
    resolve: async ({ input }) => {
      if (input.users.length === 1) {
        return {
          id: `any;-;${input.users[0]!.id}`,
        };
      }
      return {
        id: "",
      };
    },
  },
  actions: {
    send: async ({ space, content }) => {},
  },
  hooks: {
    afterInit: async ({ config, store, spectrum }) => {
      // biome-ignore lint/complexity/useLiteralKeys: accessing private property
      const spectrumConfig = spectrum["config"];

      if (config.useLocal) {
        const sdk = new IMessageSDK();
        store.save("client", sdk);
      } else {
      }
    },
  },
});

const spectrum = new Spectrum({
  projectID: "1",
  projectSecret: "1",
  providers: [imessage.config({})],
});

const user = await imessage(spectrum).user("+13322593374");
const space = await imessage(spectrum).space(user);
spectrum.send(space, text("1"));
