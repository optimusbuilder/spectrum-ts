import type { Fn, Objects, Pipe } from "hotscript";
import z from "zod";
import { Spectrum, type Spectrum as BaseSpectrum } from "../core";

const SpaceKind = {
    Direct: "direct",
    Group: "group",
} as const;

type SpaceKindType = (typeof SpaceKind)[keyof typeof SpaceKind];

type SpaceDef = {
    kind: SpaceKindType;
};

type SpacesDef = Record<string, SpaceDef>;

interface HasSpaceKindType<Kind extends SpaceKindType> extends Fn {
    return: this["arg0"] extends { kind: Kind } ? true : false;
}

type KeysBySpaceKindType<Spaces extends SpacesDef, Kind extends SpaceKindType> = Pipe<
    Spaces,
    [Objects.PickBy<HasSpaceKindType<Kind>>, Objects.Keys]
    >;

export type PlatformProviderConfig = {
    __tag: "PlatformProviderConfig"
}

export type PlatformDef<_SpacesDef extends SpacesDef, _ProviderSchema extends z.ZodType<object>, _ConfigBuilder extends (config: z.infer<_ProviderSchema>) => Promise<object>> = {
    name: string;
    spaces: _SpacesDef;
    defaultDirect: KeysBySpaceKindType<_SpacesDef, "direct">;
    defaultGroup: KeysBySpaceKindType<_SpacesDef, "group">;
    providerSchema: _ProviderSchema;
    configBuilder: _ConfigBuilder;
    userBuilder: (_: {config: Awaited<ReturnType<_ConfigBuilder>>}) => Promise<string>;
};

export type Platform<_PlatformDef extends PlatformDef<any, any, any>> = ((
    spectrum: BaseSpectrum,
) => Platform.Spectrum<_PlatformDef>) & ({
    config(config: z.input<_PlatformDef["providerSchema"]>): PlatformProviderConfig;
})

namespace Platform {
    export type Spectrum<_PlatformDef extends PlatformDef<any, any, any>> = BaseSpectrum & {
        user(userID: string): void;
    };

    export type User<_PlatformDef extends PlatformDef<any, any, any>> = {};
}

export function definePlatform<_SpacesDef extends SpacesDef, _ProviderSchema extends z.ZodType<object>, _ConfigBuilder extends (config: z.infer<_ProviderSchema>) => Promise<object>>(
    def: PlatformDef<_SpacesDef, _ProviderSchema, _ConfigBuilder>,
): Platform<PlatformDef<_SpacesDef, _ProviderSchema, _ConfigBuilder>> {
    return null as any;
}

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
    providerSchema: z.object({
        useLocal: z.boolean().default(false),
    }),
    configBuilder: async (config) => {
        return config
    },
    userBuilder: async ({ config }) => {
        return config.useLocal ? "local" : "remote"
    }
});

const spectrum = new Spectrum({
    projectID: "1",
    projectSecret: "1",
    providers: [
        imessage.config({})
    ]
})

const imessageSpectrum = imessage(spectrum);
const user = await imessageSpectrum.user("");
