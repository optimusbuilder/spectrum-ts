import type { Content } from "./content";
import type { Space } from "./space";
import type { User } from "./user";

export interface Message<
  TPlatform extends string = string,
  TSender extends User = User,
  TSpace extends Space = Space,
> {
  content: Content[];
  readonly id: string;
  platform: TPlatform;
  react(reaction: string): Promise<void>;
  sender: TSender;
  space: TSpace;
  timestamp: Date;
}
