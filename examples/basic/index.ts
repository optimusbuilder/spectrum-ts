import { Spectrum, text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const app = await Spectrum("example", "secret", {
  providers: [
    imessage.config({
      clients: {
        address: "18qli20k.imsg.photon.codes:443",
        token: "",
      },
    }),
    terminal.config({}),
  ],
});

for await (const [space, message] of app.messages) {
  const incoming = message.content
    .filter((c) => c.type === "plain_text")
    .map((c) => c.text)
    .join(" ");

  console.log(imessage(space).type);

  await space.send(text(`echo: ${incoming}`));
}

const newUser = await imessage(app).user("xxx");
await imessage(app).space(newUser);
