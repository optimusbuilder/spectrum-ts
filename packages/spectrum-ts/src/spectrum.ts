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
import { channel } from "./utils/stream";

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

  const { push, iterable, close } = channel<[RichSpace, Message]>();

  // Track running iterators for cancellation
  const runningIterators: AsyncIterator<unknown>[] = [];

  // Custom event streams keyed by event name
  const customEventStreams = new Map<
    string,
    ReturnType<typeof channel<unknown>>
  >();

  let started = false;
  let stopped = false;

  const getOrCreateCustomStream = (eventName: string) => {
    let eventStream = customEventStreams.get(eventName);
    if (!eventStream) {
      eventStream = channel<unknown>();
      customEventStreams.set(eventName, eventStream);
    }
    return eventStream;
  };

  const consumeMessages = async (
    iterable: AsyncIterable<unknown>,
    def: AnyPlatformDef,
    client: unknown,
    userConfig: unknown
  ) => {
    const iterator = iterable[Symbol.asyncIterator]();
    runningIterators.push(iterator);
    try {
      let result = await iterator.next();
      while (!result.done) {
        const msg = result.value as BaseMessage;
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
        result = await iterator.next();
      }
    } catch (_error) {
      // Stream ended or errored — stop gracefully
    }
  };

  const consumeCustomEvent = async (
    eventName: string,
    iterable: AsyncIterable<unknown>,
    platformName: string
  ) => {
    const target = getOrCreateCustomStream(eventName);
    const iterator = iterable[Symbol.asyncIterator]();
    runningIterators.push(iterator);
    try {
      let result = await iterator.next();
      while (!result.done) {
        target.push({ ...(result.value as object), platform: platformName });
        result = await iterator.next();
      }
    } catch (_error) {
      // Stream ended or errored — stop gracefully
    }
  };

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

      // Start messages event stream (fire-and-forget)
      const messagesIterable = def.events.messages({
        client,
        config: userConfig,
      });
      consumeMessages(messagesIterable, def, client, userConfig);

      // Start custom event streams (fire-and-forget)
      for (const eventName of Object.keys(def.events)) {
        if (eventName === "messages") {
          continue;
        }
        const producer = def.events[eventName] as
          | ((ctx: {
              client: unknown;
              config: unknown;
            }) => AsyncIterable<unknown>)
          | undefined;
        if (producer) {
          const iterable = producer({ client, config: userConfig });
          consumeCustomEvent(eventName, iterable, def.name);
        }
      }
    }
  };

  const stopOnce = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    close();

    // Close all custom event streams
    for (const [, eventStream] of customEventStreams) {
      eventStream.close();
    }
    customEventStreams.clear();

    // Signal all running iterators to stop
    for (const iterator of runningIterators) {
      await iterator.return?.({ value: undefined, done: true });
    }
    runningIterators.length = 0;

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
      const iterator = iterable[Symbol.asyncIterator]();
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

  // Proxy for flat custom event access (app.typing, app.readReceipt, etc.)
  const customEventProxy = new Proxy(
    {} as Record<string, AsyncIterable<unknown>>,
    {
      get(_target, prop: string) {
        const eventStream = customEventStreams.get(prop);
        if (eventStream) {
          return eventStream.iterable;
        }
        // Pre-create the channel so it's ready when events start flowing
        return getOrCreateCustomStream(prop).iterable;
      },
    }
  );

  const base = {
    __providers: options.providers,
    __internal: { platforms: platformStates },
    messages,
    start: startOnce,
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
