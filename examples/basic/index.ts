import { image, Spectrum, text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

// import { terminal } from "spectrum-ts/providers/terminal";

const app = await Spectrum("example", "secret", {
  providers: [
    imessage.config({
      // local: true,
      clients: {
        address: "18qli20k.imsg.photon.codes:443",
        token: "",
      },
    }),
    // terminal.config({}),
  ],
});

// for await (const [space, message] of app.messages) {
//   const incoming = message.content
//     .filter((c) => c.type === "plain_text")
//     .map((c) => c.text)
//     .join(" ");

//   console.log(imessage(space));

//   await space.send(text(`echo: ${incoming}`));
// }

const user1 = await imessage(app).user("+13322593374");
// const user2 = await imessage(app).user("+15103658086");
const newSpace = await imessage(app).space(user1);
await newSpace.send(
  text("hello"),
  image("/Users/ryanzhu/Downloads/Image.jpeg")
);
