import type { Content } from "./content";

export interface Space<_Def = unknown> {
  readonly __platform: string;
  readonly id: string;
  send(...content: [Content, ...Content[]]): Promise<void>;
}
