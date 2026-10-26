import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const directory = join(homedir(), "Library/Containers/app.cyan.markedit/Data/Documents/scripts");
const target = join(directory, "markedit-pika.js");
await mkdir(directory, { recursive: true });
await copyFile(new URL("../dist/markedit-pika.js", import.meta.url), target);
console.log(`Installed ${target}. Restart MarkEdit, then open Extensions → Pika.`);
