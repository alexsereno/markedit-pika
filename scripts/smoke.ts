import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir(".test-output", { recursive: true });
await build({
  entryPoints: ["tests/host.ts"],
  bundle: true,
  outfile: ".test-output/host.js",
  format: "iife",
  platform: "browser",
  target: "safari16",
});
const inlineScript = async (path: string) =>
  (await Bun.file(path).text()).replace(/<\/script/gi, "<\\/script");
const host = await inlineScript(".test-output/host.js");
const extension = await inlineScript("dist/markedit-pika.js");
await Bun.write(
  ".test-output/smoke.html",
  `<!doctype html><meta charset="utf-8"><body><script>console.log = console.warn = console.error = (...args) => window.webkit.messageHandlers.log.postMessage(args.map(String).join(" ")); window.onerror = message => window.webkit.messageHandlers.result.postMessage(String(message));</script><script>${host}</script><script>${extension}</script><script>runSmoke().then(result => window.webkit.messageHandlers.result.postMessage(JSON.stringify(result))).catch(error => window.webkit.messageHandlers.result.postMessage(String(error) + "\\n" + String(error.stack || "")));</script>`,
);
const process = Bun.spawn(
  ["swift", "scripts/webkit-smoke.swift", `${import.meta.dir}/../.test-output/smoke.html`],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await process.exited) !== 0) throw new Error("WebKit smoke test failed");
