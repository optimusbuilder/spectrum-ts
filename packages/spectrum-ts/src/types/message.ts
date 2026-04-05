import type { Content } from "./content";
import type { User } from "./user";

export interface Message {
  content: Content[];
  platform: string;
  raw: unknown;
  sender: User;
  timestamp: Date;
}
