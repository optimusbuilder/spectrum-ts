import { Spectrum, text } from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";

const app = Spectrum("example", "secret", {
  providers: [terminal.config({})],
});

for await (const [space, message] of app.messages) {
  const incoming = message.content
    .filter((c) => c.type === "plain_text")
    .map((c) => c.text)
    .join(" ");

  await space.send(text(`echo: ${incoming}`));
}
