import type { Fn, Objects, Pipe } from "hotscript";
import type z from "zod";
import type { Space as BaseSpace } from "../core/space";
import { type Spectrum as BaseSpectrum, Spectrum } from "../core/spectrum";
import type { Store } from "../core/store";
import type { User as BaseUser } from "../core/user";
import type { Content } from "../core/content";

export const SpaceKind = {
    Direct: "direct",
    Group: "group",
} as const;

type SpaceKindType = (typeof SpaceKind)[keyof typeof SpaceKind];

type SpaceDef = {
    kind: SpaceKindType;
};

export type SpacesDef = Record<string, SpaceDef>;

interface HasSpaceKindType<Kind extends SpaceKindType> extends Fn {
    return: this["arg0"] extends { kind: Kind } ? true : false;
}

type KeysBySpaceKindType<Spaces extends SpacesDef, Kind extends SpaceKindType> = Pipe<
    Spaces,
    [Objects.PickBy<HasSpaceKindType<Kind>>, Objects.Keys]
>;

type KnownKeys<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

export type PlatformProviderConfig = {
    __tag: "PlatformProviderConfig";
};

export type PlatformDef<
    _SpacesDef extends SpacesDef,
    _ConfigSchema extends z.ZodType<object>,
    _UserSchema extends z.ZodType<object>,
    _SpaceSchema extends z.ZodType<object>,
> = {
    name: string;
    spaces: _SpacesDef;
    defaultDirect: KeysBySpaceKindType<_SpacesDef, "direct">;
    defaultGroup: KeysBySpaceKindType<_SpacesDef, "group">;
    config: {
        schema: _ConfigSchema;
    };
    user: {
        schema: _UserSchema;
        resolve: (_: {
            input: {
                userID: string;
            };
            config: z.infer<_ConfigSchema>;
            store: Store;
        }) => Promise<BaseUser & KnownKeys<z.infer<_UserSchema>>>;
    };
    space: {
        schema: _SpaceSchema;
        resolve: (_: {
            input: {
                users: (BaseUser & KnownKeys<z.infer<_UserSchema>>)[];
            };
            config: z.infer<_ConfigSchema>;
            store: Store;
        }) => Promise<BaseSpace & KnownKeys<z.infer<_SpaceSchema>>>;
    };
    actions: {
        send: (_: {
            space: BaseSpace & KnownKeys<z.infer<_SpaceSchema>>;
            content: Content[];
            config: z.infer<_ConfigSchema>;
            store: Store;
        }) => Promise<void>
    };
    hooks?: {
        afterInit?: (_: {
            config: z.infer<_ConfigSchema>;
            store: Store;
            spectrum: BaseSpectrum;
        }) => Promise<void>;
    }
};

type AnyPlatformDef = PlatformDef<any, any, any, any>;

export type Platform<_PlatformDef extends PlatformDef<any, any, any, any>> = ((
    spectrum: BaseSpectrum,
) => Platform.Spectrum<_PlatformDef>) & {
    config(config: z.input<_PlatformDef["config"]["schema"]>): PlatformProviderConfig;
};

export namespace Platform {
    export type Spectrum<_PlatformDef extends AnyPlatformDef> = BaseSpectrum & {
        user(userID: string): User<_PlatformDef>;
    } & {
        space(user: User<_PlatformDef>): Space<_PlatformDef>;
    };

    export type User<_PlatformDef extends AnyPlatformDef> = BaseUser & z.infer<_PlatformDef["user"]["schema"]>;

    export type Space<_PlatformDef extends AnyPlatformDef> = BaseSpace;
}
