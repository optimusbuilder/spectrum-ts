import z from "zod";
import type { PlatformProviderConfig } from "../platform/type";
import type { Space } from "./space";
import type { Content } from "./content";

const specturmConfigSchema = z.object({
    projectID: z.string().min(1),
    projectSecret: z.string().min(1),
    providers: z.array(z.custom<PlatformProviderConfig>())
})

type SpectrumConfig = z.infer<typeof specturmConfigSchema>;

export class Spectrum {
    private readonly config: SpectrumConfig;
    
    constructor(config: SpectrumConfig) {
        this.config = config;
    }
    
    async send(space: Space, ...content: [Content, ...Content[]]) {
        
    }
}
