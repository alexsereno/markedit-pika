import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/markedit-pika.js",
  format: "cjs",
  platform: "browser",
  target: "safari16",
  minify: true,
  external: ["markedit-api"],
  legalComments: "linked",
  metafile: true,
  banner: { js: "/*! MarkEdit Pika 0.1.1 — MIT. See THIRD_PARTY_NOTICES.txt. */" },
});
const packages = new Set<string>();
for (const file of Object.keys(result.metafile.inputs)) {
  const match = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (match) packages.add(match[1]);
}
let notices = `MarkEdit Pika — license and bundled third-party licenses\n\n${await Bun.file("LICENSE").text()}\n\nMarkEdit preview close control styling\n${await Bun.file("scripts/MarkEdit-LICENSE.txt").text()}\n`;
for (const name of [...packages].sort()) {
  const pkg = await Bun.file(`node_modules/${name}/package.json`).json();
  notices += `\n${name} ${pkg.version} (${pkg.license})\n`;
  for (const file of ["license", "LICENSE", "LICENSE.md", "LICENSE-MIT"]) {
    const source = Bun.file(`node_modules/${name}/${file}`);
    if (await source.exists()) {
      notices += `${await source.text()}\n`;
      break;
    }
  }
}
notices = `${notices.trimEnd()}\n`;
await Bun.write("THIRD_PARTY_NOTICES.txt", notices);
await Bun.write(
  "dist/markedit-pika.js",
  `${await Bun.file("dist/markedit-pika.js").text()}\n/*!\n${notices.replaceAll("*/", "* /")}*/\n`,
);
console.log("Built dist/markedit-pika.js");
