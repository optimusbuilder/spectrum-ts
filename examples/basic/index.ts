import { Spectrum, text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const app = await Spectrum("example", "secret", {
  providers: [
    imessage.config({
      clients: {
        address: "18qli20k.imsg.photon.codes:443",
        token: "",
      },
    }),
  ],
});

// for await (const [space, message] of app.messages) {
//   const incoming = message.content
//     .filter((c) => c.type === "plain_text")
//     .map((c) => c.text)
//     .join(" ");

//   await space.send(text(`echo: ${incoming}`));
// }

const im = imessage(app);
const user = await im.user("+13322593374");
const space = await im.space([user], { type: "dm" });
await app.send(space, text("hello"));
console.log("sent");
