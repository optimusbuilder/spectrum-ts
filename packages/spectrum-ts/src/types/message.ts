import type { Content } from "./content";
import type { Space } from "./space";
import type { User } from "./user";

export interface Message<
  TPlatform extends string = string,
  TSender extends User = User,
  TSpace extends Space = Space,
> {
  content: Content[];
  platform: TPlatform;
  raw: unknown;
  sender: TSender;
  space: TSpace;
  timestamp: Date;
}
