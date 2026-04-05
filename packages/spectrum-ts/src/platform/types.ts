import type { Fn, Pipe, Tuples } from "hotscript";
import type z from "zod";
import type { Content } from "../types/content";
import type { Message } from "../types/message";
import type { RichSpace, Space } from "../types/space";
import type { User } from "../types/user";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type KnownKeys<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : K]: T[K];
};

type SchemaInfer<T> = T extends { schema: infer S extends z.ZodType }
  ? z.infer<S>
  : Record<string, never>;

type SchemaInput<T> = T extends { schema: infer S extends z.ZodType }
  ? z.input<S>
  : Record<string, never>;

type EventPayload<F> = F extends (
  client: never,
  handler: (data: infer D) => void
) => unknown
  ? D
  : never;

// ---------------------------------------------------------------------------
// PlatformDef — the full definition of a platform adapter
// ---------------------------------------------------------------------------

export interface PlatformDef<
  _Name extends string = string,
  _ConfigSchema extends z.ZodType<object> = z.ZodType<object>,
  _UserSchema extends z.ZodType<object> = z.ZodType<object>,
  _SpaceSchema extends z.ZodType<object> = z.ZodType<object>,
  _Client = unknown,
  _Events extends object = object,
  _MessageType = unknown,
> {
  actions: {
    send: (_: {
      space: Space;
      content: Content[];
      client: _Client;
      config: z.infer<_ConfigSchema>;
    }) => Promise<void>;
  };

  config: _ConfigSchema;

  events: _Events;

  lifecycle: {
    createClient: (ctx: { config: z.infer<_ConfigSchema> }) => Promise<_Client>;
    destroyClient: (ctx: { client: _Client }) => Promise<void>;
    listen: (ctx: {
      client: _Client;
      config: z.infer<_ConfigSchema>;
      push: (msg: _MessageType) => void;
    }) => Promise<void>;
  };

  message?: {
    schema?: z.ZodType<object>;
  };
  name: _Name;

  space: {
    schema?: _SpaceSchema;
    resolve: (_: {
      input: {
        users: (User & KnownKeys<z.infer<_UserSchema>>)[];
        options: z.infer<_SpaceSchema>;
      };
      client: _Client;
      config: z.infer<_ConfigSchema>;
    }) => Promise<Space>;
  };

  user: {
    schema?: _UserSchema;
    resolve: (_: {
      input: { userID: string };
      client: _Client;
      config: z.infer<_ConfigSchema>;
    }) => Promise<User & KnownKeys<z.infer<_UserSchema>>>;
  };
}

// ---------------------------------------------------------------------------
// AnyPlatformDef — structural wildcard for erasure contexts
// ---------------------------------------------------------------------------

export interface AnyPlatformDef {
  actions: {
    // biome-ignore lint/suspicious/noExplicitAny: wildcard action
    send: (_: any) => Promise<void>;
  };
  config: z.ZodType<object>;
  events: object;
  lifecycle: {
    // biome-ignore lint/suspicious/noExplicitAny: wildcard lifecycle
    createClient: (ctx: any) => Promise<any>;
    // biome-ignore lint/suspicious/noExplicitAny: wildcard lifecycle
    destroyClient: (ctx: any) => Promise<void>;
    // biome-ignore lint/suspicious/noExplicitAny: wildcard lifecycle
    listen: (ctx: any) => Promise<void>;
  };
  message?: { schema?: z.ZodType<object> };
  name: string;
  space: {
    schema?: z.ZodType<object>;
    // biome-ignore lint/suspicious/noExplicitAny: wildcard resolver
    resolve: (_: any) => Promise<any>;
  };
  user: {
    schema?: z.ZodType<object>;
    // biome-ignore lint/suspicious/noExplicitAny: wildcard resolver
    resolve: (_: any) => Promise<any>;
  };
}

// ---------------------------------------------------------------------------
// PlatformProviderConfig — carries platform def type through providers array
// ---------------------------------------------------------------------------

export interface PlatformProviderConfig<
  Def extends AnyPlatformDef = AnyPlatformDef,
> {
  readonly __def: Def;
  readonly __definition: AnyPlatformDef;
  readonly __name: Def["name"];
  readonly __tag: "PlatformProviderConfig";
  readonly config: unknown;
}

// ---------------------------------------------------------------------------
// HotScript Fn's for type-level provider operations
// ---------------------------------------------------------------------------

interface MatchesPlatformName<Name extends string> extends Fn {
  return: this["arg0"] extends PlatformProviderConfig<infer Def>
    ? Def["name"] extends Name
      ? true
      : false
    : false;
}

interface ExtractDef extends Fn {
  return: this["arg0"] extends PlatformProviderConfig<infer Def> ? Def : never;
}

interface ToMessageVariant extends Fn {
  return: this["arg0"] extends PlatformProviderConfig<infer Def>
    ? {
        platform: Def["name"];
        content: Content[];
        sender: User & KnownKeys<SchemaInfer<Def["user"]>>;
        raw: unknown;
        timestamp: Date;
      }
    : never;
}

interface ExtractDefByName<Name extends string> extends Fn {
  return: this["arg0"] extends { name: Name } ? true : false;
}

// ---------------------------------------------------------------------------
// HasProvider — check if a platform name exists in providers tuple
// ---------------------------------------------------------------------------

export type HasProvider<
  Providers extends PlatformProviderConfig[],
  Name extends string,
> = Pipe<Providers, [Tuples.Some<MatchesPlatformName<Name>>]>;

// ---------------------------------------------------------------------------
// ExtractProviderDef — pull a platform's def from the providers tuple
// ---------------------------------------------------------------------------

export type ExtractProviderDef<
  Providers extends PlatformProviderConfig[],
  Name extends string,
> = Pipe<
  Providers,
  [Tuples.Map<ExtractDef>, Tuples.Find<ExtractDefByName<Name>>]
>;

// ---------------------------------------------------------------------------
// UnifiedMessage — discriminated union from providers tuple
// ---------------------------------------------------------------------------

export type UnifiedMessage<Providers extends PlatformProviderConfig[]> = Pipe<
  Providers,
  [Tuples.Map<ToMessageVariant>, Tuples.ToUnion]
>;

// ---------------------------------------------------------------------------
// Platform-specific Space, Message, and User types
// ---------------------------------------------------------------------------

export type PlatformSpace<_Def extends AnyPlatformDef> = RichSpace;

export type PlatformMessage<Def extends AnyPlatformDef> = Message &
  KnownKeys<SchemaInfer<Def["message"]>> & {
    platform: Def["name"];
    sender: User & KnownKeys<SchemaInfer<Def["user"]>>;
  };

export type PlatformUser<Def extends AnyPlatformDef> = User &
  KnownKeys<SchemaInfer<Def["user"]>>;

// ---------------------------------------------------------------------------
// PlatformInstance — returned from imessage(spectrum)
// ---------------------------------------------------------------------------

export interface PlatformInstance<Def extends AnyPlatformDef> {
  on<E extends string & keyof Def["events"]>(
    event: E,
    handler: (data: EventPayload<Def["events"][E]>) => void | Promise<void>
  ): void;
  space(
    users: PlatformUser<Def>[],
    options: SchemaInput<Def["space"]>
  ): Promise<PlatformSpace<Def>>;
  user(userID: string): Promise<PlatformUser<Def>>;
}

// ---------------------------------------------------------------------------
// SpectrumLike — minimal interface for platform narrowing
// ---------------------------------------------------------------------------

export interface SpectrumLike<
  Providers extends PlatformProviderConfig[] = PlatformProviderConfig[],
> {
  readonly __internal: {
    platforms: Map<
      string,
      { client: unknown; config: unknown; definition: AnyPlatformDef }
    >;
  };
  readonly __providers: Providers;
}

// ---------------------------------------------------------------------------
// Platform — the callable returned by definePlatform()
// ---------------------------------------------------------------------------

export interface Platform<Def extends AnyPlatformDef> {
  config(config: z.input<Def["config"]>): PlatformProviderConfig<Def>;
  <Providers extends PlatformProviderConfig[]>(
    spectrum: SpectrumLike<Providers>
  ): HasProvider<Providers, Def["name"]> extends true
    ? PlatformInstance<Def>
    : never;

  (space: RichSpace): PlatformSpace<Def>;

  (message: Message): PlatformMessage<Def>;
}

export type { Message } from "../types/message";
