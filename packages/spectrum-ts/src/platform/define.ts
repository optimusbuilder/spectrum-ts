import type z from "zod";
import type { Content } from "../types/content";
import type { Message } from "../types/message";
import type { Space } from "../types/space";
import type {
  AnyPlatformDef,
  Platform,
  PlatformDef,
  PlatformInstance,
  PlatformMessage,
  PlatformProviderConfig,
  PlatformSpace,
  PlatformUser,
  SpectrumLike,
} from "./types";

function createPlatformInstance<
  Def extends AnyPlatformDef,
  _Client,
  _ConfigSchema extends z.ZodType<object>,
>(
  def: Def,
  runtime: { client: unknown; config: unknown }
): PlatformInstance<Def> {
  const base = {
    async user(userID: string) {
      const resolved = await def.user.resolve({
        input: { userID },
        client: runtime.client as _Client,
        config: runtime.config as z.infer<_ConfigSchema>,
      });
      return {
        ...resolved,
        __platform: def.name,
      } as PlatformUser<Def>;
    },

    async space(users: PlatformUser<Def>[], options: unknown) {
      const parsedOptions = def.space.schema
        ? def.space.schema.parse(options)
        : options;
      const resolved = await def.space.resolve({
        input: { users, options: parsedOptions },
        client: runtime.client as _Client,
        config: runtime.config as z.infer<_ConfigSchema>,
      });
      return {
        ...resolved,
        __platform: def.name,
        send: async (...content: [Content, ...Content[]]) => {
          await def.actions.send({
            space: resolved,
            content,
            client: runtime.client as _Client,
            config: runtime.config as z.infer<_ConfigSchema>,
          });
        },
      } as PlatformSpace<Def>;
    },
  };

  // Add flat event properties for custom events (non-messages)
  const eventProperties: Record<string, AsyncIterable<unknown>> = {};
  for (const eventName of Object.keys(def.events)) {
    if (eventName === "messages") {
      continue;
    }
    const producer = def.events[eventName] as
      | ((ctx: { client: unknown; config: unknown }) => AsyncIterable<unknown>)
      | undefined;
    if (producer) {
      eventProperties[eventName] = producer({
        client: runtime.client,
        config: runtime.config,
      });
    }
  }

  return Object.assign(base, eventProperties) as PlatformInstance<Def>;
}

export function definePlatform<
  _Name extends string,
  _ConfigSchema extends z.ZodType<object>,
  _UserSchema extends z.ZodType<object>,
  _SpaceSchema extends z.ZodType<object>,
  _Client,
  _MessageType,
  _Events extends {
    messages: (ctx: {
      client: _Client;
      config: z.infer<_ConfigSchema>;
    }) => AsyncIterable<_MessageType>;
  },
>(
  name: _Name,
  def: Omit<
    PlatformDef<
      _Name,
      _ConfigSchema,
      _UserSchema,
      _SpaceSchema,
      _Client,
      _MessageType,
      _Events
    >,
    "name"
  >
): Platform<
  PlatformDef<
    _Name,
    _ConfigSchema,
    _UserSchema,
    _SpaceSchema,
    _Client,
    _MessageType,
    _Events
  >
> {
  type Def = PlatformDef<
    _Name,
    _ConfigSchema,
    _UserSchema,
    _SpaceSchema,
    _Client,
    _MessageType,
    _Events
  >;

  const fullDef = { name, ...def };

  const platformCache = new WeakMap<SpectrumLike, PlatformInstance<Def>>();

  const narrowSpectrum = (spectrum: SpectrumLike) => {
    const cached = platformCache.get(spectrum);
    if (cached) {
      return cached;
    }

    const runtime = spectrum.__internal.platforms.get(name);
    if (!runtime) {
      throw new Error(`Platform "${name}" is not registered`);
    }

    const instance = createPlatformInstance<Def, _Client, _ConfigSchema>(
      fullDef as Def & AnyPlatformDef,
      runtime
    );
    platformCache.set(spectrum, instance);
    return instance;
  };

  const narrowSpace = (input: Space) => {
    if (input.__platform !== name) {
      throw new Error(
        `Expected space from "${name}", got "${input.__platform}"`
      );
    }
    return input as PlatformSpace<Def>;
  };

  const narrowMessage = (input: Message) => {
    if (input.platform !== name) {
      throw new Error(
        `Expected message from "${name}", got "${input.platform}"`
      );
    }
    return input as PlatformMessage<Def>;
  };

  const narrower = ((input: SpectrumLike | Space | Message) => {
    if ("__providers" in input && "__internal" in input) {
      return narrowSpectrum(input as SpectrumLike);
    }
    if ("__platform" in input && "send" in input) {
      return narrowSpace(input as Space);
    }
    if ("platform" in input && "raw" in input) {
      return narrowMessage(input as Message);
    }
    throw new Error("Invalid input to platform narrowing function");
  }) as Platform<Def>;

  narrower.config = (config: z.input<_ConfigSchema>) => {
    return {
      __tag: "PlatformProviderConfig" as const,
      __def: undefined as unknown as Def,
      __name: name,
      config,
      __definition: fullDef as AnyPlatformDef,
    } satisfies PlatformProviderConfig<Def> as PlatformProviderConfig<Def>;
  };

  return narrower;
}
