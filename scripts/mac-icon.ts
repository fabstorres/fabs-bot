import { Resvg } from "@resvg/resvg-js";

const svg = await Bun.file("assets/icon.svg").text();

const sizes = [
  ["ic11", 32],
  ["ic12", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic13", 256],
  ["ic09", 512],
  ["ic14", 512],
  ["ic10", 1024],
] as const;

function chunk(type: string, data: Uint8Array) {
  const head = Buffer.alloc(8);
  head.write(type, "ascii");
  head.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([head, data]);
}

const png = (size: number) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
const icons = Buffer.concat(sizes.map(([type, size]) => chunk(type, png(size))));

await Bun.write("assets/icon.icns", chunk("icns", icons));
