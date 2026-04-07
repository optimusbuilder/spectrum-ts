import z from "zod";
import type {
  AnyPlatformDef,
  CustomEventStreams,
  PlatformProviderConfig,
  SpectrumLike,
  UnifiedMessage,
} from "./platform/types";
import type { Content } from "./types/content";
import type { Message as BaseMessage } from "./types/message";
import type { RichSpace } from "./types/space";
import { type ManagedStream, mergeStreams, stream } from "./utils/stream";

// ---------------------------------------------------------------------------
// SpectrumInstance — the typed return of Spectrum()
// ---------------------------------------------------------------------------

export type SpectrumInstance<
  Providers extends PlatformProviderConfig[] = PlatformProviderConfig[],
> = SpectrumLike<Providers> &
  CustomEventStreams<Providers> & {
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

  // Custom event streams keyed by event name
  const customEventStreams = new Map<string, ManagedStream<unknown>>();

  let initialized = false;
  let stopped = false;

  const initializeOnce = async () => {
    if (initialized) {
      return;
    }
    initialized = true;

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
    }
  };

  const adaptIterable = <T>(iterable: AsyncIterable<T>): ManagedStream<T> => {
    return stream<T>((emit, end) => {
      const iterator = iterable[Symbol.asyncIterator]();

      (async () => {
        try {
          let result = await iterator.next();
          while (!result.done) {
            emit(result.value);
            result = await iterator.next();
          }
          end();
        } catch (error) {
          end(error);
        }
      })();

      return async () => {
        await iterator.return?.();
      };
    });
  };

  const createProviderMessagesStream = (state: {
    client: unknown;
    config: unknown;
    definition: AnyPlatformDef;
  }): ManagedStream<[RichSpace, Message]> => {
    const { client, config, definition } = state;
    const providerMessages = definition.events.messages({
      client,
      config,
    }) as AsyncIterable<BaseMessage>;

    const normalizeMessages = async function* (): AsyncIterable<
      [RichSpace, Message]
    > {
      for await (const msg of providerMessages) {
        const richSpace: RichSpace = {
          id: msg.sender.id,
          __platform: definition.name,
          send: async (...content: [Content, ...Content[]]) => {
            await definition.actions.send({
              space: { id: msg.sender.id, __platform: definition.name },
              content,
              client,
              config,
            });
          },
        };

        yield [richSpace, msg as Message];
      }
    };

    return adaptIterable(normalizeMessages());
  };

  const createMessagesStream = (): ManagedStream<[RichSpace, Message]> => {
    return stream<[RichSpace, Message]>(async (emit, end) => {
      await initializeOnce();
      const merged = mergeStreams(
        Array.from(platformStates.values(), createProviderMessagesStream)
      );

      (async () => {
        try {
          for await (const value of merged) {
            emit(value);
          }
          end();
        } catch (error) {
          end(error);
        }
      })();

      return async () => {
        await merged.close();
      };
    });
  };

  const createCustomEventStream = (
    eventName: string
  ): ManagedStream<unknown> => {
    return stream<unknown>(async (emit, end) => {
      await initializeOnce();
      const providerStreams = Array.from(platformStates.values(), (state) => {
        const { client, config, definition } = state;
        const producer = definition.events[eventName] as
          | ((ctx: {
              client: unknown;
              config: unknown;
            }) => AsyncIterable<unknown>)
          | undefined;
        if (!producer) {
          return undefined;
        }

        const providerEvents = producer({ client, config });
        const annotatePlatform = async function* (): AsyncIterable<unknown> {
          for await (const value of providerEvents) {
            yield { ...(value as object), platform: definition.name };
          }
        };

        return adaptIterable(annotatePlatform());
      }).filter(
        (value): value is ManagedStream<unknown> => value !== undefined
      );

      const merged = mergeStreams(providerStreams);

      (async () => {
        try {
          for await (const value of merged) {
            emit(value);
          }
          end();
        } catch (error) {
          end(error);
        }
      })();

      return async () => {
        await merged.close();
      };
    });
  };

  const messagesStream = createMessagesStream();

  const stopOnce = async () => {
    if (stopped) {
      return;
    }
    stopped = true;

    const clientShutdowns = Array.from(platformStates.values(), (state) =>
      state.definition.lifecycle.destroyClient({
        client: state.client,
      })
    );
    const streamShutdowns = [
      messagesStream.close(),
      ...Array.from(customEventStreams.values(), (eventStream) =>
        eventStream.close()
      ),
    ];

    await Promise.allSettled([...streamShutdowns, ...clientShutdowns]);
    customEventStreams.clear();
    platformStates.clear();
  };

  const handleSignal = () => {
    stopOnce();
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  const messages = messagesStream as AsyncIterable<[RichSpace, Message]>;

  // Proxy for flat custom event access (app.typing, app.readReceipt, etc.)
  const customEventProxy = new Proxy(
    {} as Record<string, AsyncIterable<unknown>>,
    {
      get(_target, prop: string) {
        let eventStream = customEventStreams.get(prop);
        if (!eventStream) {
          eventStream = createCustomEventStream(prop);
          customEventStreams.set(prop, eventStream);
        }
        return eventStream;
      },
    }
  );

  const base = {
    __providers: options.providers,
    __internal: { platforms: platformStates },
    messages,
    start: initializeOnce,
    stop: stopOnce,
    send: async (space: RichSpace, ...content: [Content, ...Content[]]) => {
      await space.send(...content);
    },
  };

  // Merge base instance with custom event proxy
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof prop === "string") {
        return customEventProxy[prop];
      }
      return undefined;
    },
  }) as SpectrumInstance<Providers>;
}
