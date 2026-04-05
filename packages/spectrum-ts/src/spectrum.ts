import z from "zod";
import type {
  AnyPlatformDef,
  PlatformProviderConfig,
  SpectrumLike,
  UnifiedMessage,
} from "./platform/types";
import { createMessageStream } from "./stream";
import type { Content } from "./types/content";
import type { Message as BaseMessage } from "./types/message";
import type { RichSpace } from "./types/space";

// ---------------------------------------------------------------------------
// SpectrumInstance — the typed return of Spectrum()
// ---------------------------------------------------------------------------

export type SpectrumInstance<
  Providers extends PlatformProviderConfig[] = PlatformProviderConfig[],
> = SpectrumLike<Providers> & {
  readonly messages: AsyncIterable<[RichSpace, UnifiedMessage<Providers>]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(space: RichSpace, ...content: [Content, ...Content[]]): Promise<void>;
};

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

const spectrumConfigSchema = z.object({
  projectId: z.string().min(1),
  projectSecret: z.string().min(1),
  providers: z.array(z.custom<PlatformProviderConfig>()),
});

// ---------------------------------------------------------------------------
// Spectrum() factory
// ---------------------------------------------------------------------------

export function Spectrum<const Providers extends PlatformProviderConfig[]>(
  projectId: string,
  projectSecret: string,
  options: { providers: [...Providers] }
): SpectrumInstance<Providers> {
  spectrumConfigSchema.parse({
    projectId,
    projectSecret,
    providers: options.providers,
  });

  type Message = UnifiedMessage<Providers>;

  const platformStates = new Map<
    string,
    { client: unknown; config: unknown; definition: AnyPlatformDef }
  >();

  const { push, stream, close } = createMessageStream<[RichSpace, Message]>();

  let started = false;
  let stopped = false;

  const startOnce = async () => {
    if (started) {
      return;
    }
    started = true;

    for (const provider of options.providers) {
      const providerConfig = provider as PlatformProviderConfig;
      const def = providerConfig.__definition;
      const userConfig = def.config.parse(providerConfig.config);

      const client = await def.lifecycle.createClient({
        config: userConfig,
      });

      platformStates.set(def.name, {
        client,
        config: userConfig,
        definition: def,
      });

      await def.lifecycle.listen({
        client,
        config: userConfig,
        push: (rawMsg: unknown) => {
          const msg = rawMsg as BaseMessage;
          const richSpace: RichSpace = {
            id: msg.sender.id,
            __platform: def.name,
            send: async (...content: [Content, ...Content[]]) => {
              await def.actions.send({
                space: { id: msg.sender.id, __platform: def.name },
                content,
                client,
                config: userConfig,
              });
            },
          };
          push([richSpace, msg as Message]);
        },
      });
    }
  };

  const stopOnce = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    close();

    for (const [, state] of platformStates) {
      await state.definition.lifecycle.destroyClient({
        client: state.client,
      });
    }
    platformStates.clear();
  };

  const handleSignal = () => {
    stopOnce();
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  const messages: AsyncIterable<[RichSpace, Message]> = {
    [Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]();
      let firstNext = true;
      return {
        async next() {
          if (firstNext) {
            firstNext = false;
            await startOnce();
          }
          return iterator.next();
        },
        async return() {
          await stopOnce();
          return {
            value: undefined as unknown as [RichSpace, Message],
            done: true as const,
          };
        },
      };
    },
  };

  const instance: SpectrumInstance<Providers> = {
    __providers: options.providers,
    __internal: { platforms: platformStates },
    messages,
    start: startOnce,
    stop: stopOnce,
    send: async (space: RichSpace, ...content: [Content, ...Content[]]) => {
      await space.send(...content);
    },
  };

  return instance;
}
