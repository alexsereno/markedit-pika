import type { MarkEdit as Host } from "markedit-api";
import { httpsURL, type Properties, validateProperties } from "./api";
export type Link = {
  url: string;
  baseline?: Properties;
  trashed?: boolean;
  uncertain?: boolean;
  lastSent?: Properties;
  titleOverride?: string;
};
export const operations = ["create", "update", "publish", "draft", "trash", "restore"] as const;
export type Pending = {
  url?: string;
  path?: string;
  action?: (typeof operations)[number];
  started: string;
};
export type Settings = {
  version: 1;
  blog?: string;
  connectionId?: string;
  pending?: Pending;
  links: Record<string, Link>;
  uploads: Record<string, string>;
};
export class Store {
  readonly path: string;
  constructor(
    private readonly host: Host,
    scriptPath?: string,
    private readonly beforeWrite?: () => Promise<void>,
  ) {
    this.path = `${scriptPath ? scriptPath.slice(0, scriptPath.lastIndexOf("/")) : `${host.getDirectoryPath("documents")}/scripts`}/markedit-pika.settings.json`;
  }
  async read(): Promise<Settings> {
    const raw = await this.host.getFileContent(this.path);
    if (raw === undefined) return { version: 1, links: {}, uploads: {} };
    const value = JSON.parse(raw);
    const object = (item: unknown): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item);
    if (!object(value) || value.version !== 1 || !object(value.links) || !object(value.uploads))
      throw new Error(
        "The Pika settings file is invalid. It has been preserved; repair it before continuing.",
      );
    if (value.blog !== undefined) {
      if (typeof value.blog !== "string") throw new Error("Invalid saved blog URL.");
      httpsURL(value.blog);
    }
    if (value.connectionId !== undefined && typeof value.connectionId !== "string")
      throw new Error("Invalid saved connection.");
    if (
      value.pending !== undefined &&
      (!object(value.pending) || typeof value.pending.started !== "string")
    )
      throw new Error("Invalid interrupted-send record.");
    if (object(value.pending)) {
      const pending = value.pending;
      if (pending.url !== undefined) {
        if (typeof pending.url !== "string") throw new Error("Invalid interrupted post URL.");
        httpsURL(pending.url);
      }
      if (
        pending.path !== undefined &&
        (typeof pending.path !== "string" || !pending.path.startsWith("/"))
      )
        throw new Error("Invalid interrupted document path.");
      if (
        pending.action !== undefined &&
        !operations.includes(pending.action as Pending["action"] & string)
      )
        throw new Error("Invalid interrupted action.");
    }
    for (const link of Object.values(value.links)) {
      if (!object(link) || typeof link.url !== "string")
        throw new Error("Invalid saved post link.");
      httpsURL(link.url);
      if (link.baseline !== undefined) validateProperties(link.baseline);
      if (link.lastSent !== undefined) validateProperties(link.lastSent);
      if (link.titleOverride !== undefined && typeof link.titleOverride !== "string")
        throw new Error("Invalid saved title.");
    }
    for (const url of Object.values(value.uploads)) {
      if (typeof url !== "string" || !url.startsWith("https://pika.page/micropub/media/"))
        throw new Error("Invalid saved image URL.");
      httpsURL(url);
    }
    return value as Settings;
  }
  async edit(change: (settings: Settings) => void): Promise<void> {
    await this.beforeWrite?.();
    const settings = await this.read();
    change(settings);
    await this.beforeWrite?.();
    if (
      !(await this.host.createFile({
        path: this.path,
        string: `${JSON.stringify(settings, null, 2)}\n`,
        overwrites: true,
      }))
    )
      throw new Error(
        "Pika settings could not be saved. A remote operation may already have succeeded; check Pika before retrying.",
      );
  }
}
