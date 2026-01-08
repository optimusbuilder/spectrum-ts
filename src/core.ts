import z from "zod";
import { channelProviderConfigSchema, type AnyChannelProvider } from "./channel";
import type { Content } from "./content";

const specturmConfigSchema = z.object({
    projectID: z.string(),
    projectSecret: z.string(),
    providers: z.array(channelProviderConfigSchema)
})

type SpectrumConfig = z.infer<typeof specturmConfigSchema>;

export class Spectrum {
    readonly config: SpectrumConfig;
    
    constructor(config: SpectrumConfig) {
        this.config = config;
    }
    
    // Public APIs
    
    send(recipient: string, channel: AnyChannelProvider, content: Content) {}
    
    on() {
        
    }
}
