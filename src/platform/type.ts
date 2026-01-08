import type { Fn, Objects, Pipe } from "hotscript";

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

export type PlatformDef<Spaces extends SpacesDef> = {
    name: string;
    spaces: Spaces;
    defaultDirect: KeysBySpaceKindType<Spaces, "direct">;
    defaultGroup: KeysBySpaceKindType<Spaces, "group">;
};

export function definePlatform<Spaces extends SpacesDef>(def: PlatformDef<Spaces>) {}

definePlatform({
    name: "iMessage",
    spaces: {
        dm: {
            kind: SpaceKind.Direct,
        },
        group: {
            kind: SpaceKind.Group,
        }
    },
    defaultDirect: "dm",
    defaultGroup: "group",
});
