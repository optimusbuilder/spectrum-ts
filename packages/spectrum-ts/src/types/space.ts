import type { Content } from "./content";

export interface Space {
  readonly __platform: string;
  readonly id: string;
}

export type RichSpace = Space & {
  send(...content: [Content, ...Content[]]): Promise<void>;
};
