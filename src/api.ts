export const ENDPOINT = "https://pika.page/micropub";
export const MEDIA = `${ENDPOINT}/media`;
export type Photo = string | { value: string; alt?: string };
export type Properties = {
  content?: string[];
  name?: string[];
  category?: string[];
  "post-status"?: ("draft" | "published")[];
  published?: string[];
  photo?: Photo[];
};
export type Update = {
  replace?: Properties;
  add?: Properties;
  delete?: Properties | (keyof Properties)[];
};
export type Source = { properties: Properties; url?: string };
const keys = new Set(["content", "name", "category", "post-status", "published", "photo"]);
export function httpsURL(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Use an HTTPS URL without embedded credentials.");
  return url.href;
}
export function validateProperties(value: unknown): asserts value is Properties {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Properties must be an object.");
  for (const [key, list] of Object.entries(value)) {
    if (!keys.has(key)) throw new Error(`Unsupported Pika property: ${key}`);
    if (!Array.isArray(list)) throw new Error(`${key} must be an array.`);
    for (const item of list) {
      if (key === "photo") {
        const photo = typeof item === "string" ? item : item?.value;
        if (
          typeof photo !== "string" ||
          (typeof item === "object" && item.alt !== undefined && typeof item.alt !== "string")
        )
          throw new Error("Photos need a URL and optional alt text.");
        httpsURL(photo);
      } else {
        if (typeof item !== "string") throw new Error(`${key} values must be strings.`);
        if (key === "post-status" && !["draft", "published"].includes(item))
          throw new Error("Status must be draft or published.");
        if (
          key === "published" &&
          (!/^\d{4}-\d\d-\d\dT/.test(item) || !Number.isFinite(Date.parse(item)))
        )
          throw new Error("Publication date must be an ISO 8601 datetime.");
      }
    }
    if (["content", "name", "post-status", "published"].includes(key) && list.length > 1)
      throw new Error(`${key} accepts one value.`);
  }
}
// Source responses may include read-only fields such as url and service metadata.
// Keep only writable properties so baselines can never echo that metadata in updates.
function readProperties(value: unknown): Properties {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Properties must be an object.");
  const properties = Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key)));
  validateProperties(properties);
  return properties;
}
function readSource(value: unknown, location?: string | null): Source {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid post response.");
  const body = value as Record<string, unknown>;
  const raw = body.properties ?? body;
  const properties = readProperties(raw);
  const metadata = (raw as Record<string, unknown>).url ?? body.url ?? location;
  const candidate = Array.isArray(metadata) ? metadata[0] : metadata;
  const result: Source = { properties };
  if (typeof candidate === "string") result.url = httpsURL(candidate);
  return result;
}
export function validateUpdate(value: unknown): asserts value is Update {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length)
    throw new Error("Provide replace, add, or delete operations.");
  for (const [key, properties] of Object.entries(value)) {
    if (!["replace", "add", "delete"].includes(key))
      throw new Error(`Unsupported update operation: ${key}`);
    if (key === "delete" && Array.isArray(properties)) {
      if (!properties.every((x) => typeof x === "string" && keys.has(x)))
        throw new Error("Unknown property to remove.");
    } else validateProperties(properties);
  }
}
export class PikaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryAt?: number,
  ) {
    super(message);
  }
}
export class Pika {
  private blockedUntil = 0;
  private rateDelay = 60_000;
  constructor(
    private readonly token: string,
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 60_000,
  ) {}
  private async request(
    url: string,
    method: string,
    body?: BodyInit,
    json = false,
  ): Promise<Response> {
    if (Date.now() < this.blockedUntil)
      throw new PikaError(
        "Pika is rate limiting requests. Wait before trying again.",
        429,
        undefined,
        this.blockedUntil,
      );
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Request timed out"));
      }, this.timeoutMs);
    });
    let response: Response;
    try {
      response = await Promise.race([
        (async () => {
          const received = await this.transport.call(globalThis, url, {
            method,
            body,
            signal: controller.signal,
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${this.token}`,
              ...(json ? { "Content-Type": "application/json" } : {}),
            },
          });
          const bytes = await received.arrayBuffer();
          return new Response([204, 205, 304].includes(received.status) ? null : bytes, {
            status: received.status,
            statusText: received.statusText,
            headers: received.headers,
          });
        })(),
        deadline,
      ]);
    } catch {
      throw new PikaError(
        method === "GET"
          ? "Could not reach Pika. Check your connection and MarkEdit’s network support."
          : "The request did not finish. Pika may have received it. Check Pika before retrying; nothing was automatically resent.",
        0,
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
        scope?: string;
      };
      let retryAt: number | undefined;
      if (response.status === 429) {
        const retry = response.headers.get("Retry-After");
        const delay =
          retry && /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : retry
              ? Date.parse(retry) - Date.now()
              : 0;
        this.blockedUntil = Date.now() + Math.max(this.rateDelay, delay || 0);
        this.rateDelay = Math.min(this.rateDelay * 2, 3_600_000);
        retryAt = this.blockedUntil;
      }
      const hints: Record<number, string> = {
        401: "Reconnect with a valid Pika app token.",
        403:
          data.error === "insufficient_scope"
            ? `Your token needs ${data.scope || "additional"} permission. Create a new app token.`
            : "Pika denied this request. Check your account’s post limit and plan.",
        404: "The post was not found. Check its URL.",
        429: "Pika is rate limiting requests. Wait at least one minute before retrying.",
      };
      throw new PikaError(
        `${hints[response.status] || `Pika rejected the request (${response.status}).`}${data.error_description ? ` ${data.error_description}` : ""}`,
        response.status,
        data.error,
        retryAt,
      );
    }
    this.rateDelay = 60_000;
    return response;
  }
  private async post(value: unknown) {
    return this.request(ENDPOINT, "POST", JSON.stringify(value), true);
  }
  private location(response: Response): string {
    const location = response.headers.get("Location");
    if (!location)
      throw new PikaError(
        "Pika accepted the request but its Location header is unavailable. Check Pika before creating another post.",
        response.status,
      );
    return httpsURL(new URL(location, ENDPOINT).href);
  }
  async config(): Promise<{ "media-endpoint"?: string }> {
    return (await this.request(`${ENDPOINT}?q=config`, "GET")).json();
  }
  async source(url: string, properties: string[] = []): Promise<Source> {
    const query = new URLSearchParams({ q: "source", url: httpsURL(url) });
    for (const key of properties) {
      if (!keys.has(key)) throw new Error(`Unknown property: ${key}`);
      query.append("properties[]", key);
    }
    const result = await (await this.request(`${ENDPOINT}?${query}`, "GET")).json();
    return readSource(result);
  }
  async create(properties: Properties): Promise<string> {
    validateProperties(properties);
    if (!properties.content?.[0]?.trim() && !properties.photo?.length)
      throw new Error("Write a post or add a photo first.");
    return this.location(await this.post({ type: ["h-entry"], properties }));
  }
  async update(url: string, operations: Update): Promise<Source> {
    validateUpdate(operations);
    const response = await this.post({ action: "update", url: httpsURL(url), ...operations });
    try {
      const body = await response.json();
      return readSource(body, response.headers.get("Location"));
    } catch {
      throw new PikaError(
        "Pika accepted the update but its response could not be read. Fetch the source before retrying.",
        response.status,
      );
    }
  }
  async trash(url: string): Promise<void> {
    await this.post({ action: "delete", url: httpsURL(url) });
  }
  async restore(url: string): Promise<void> {
    await this.post({ action: "undelete", url: httpsURL(url) });
  }
  async upload(file: Blob, name: string, endpoint = MEDIA): Promise<string> {
    if (httpsURL(endpoint) !== MEDIA)
      throw new Error("Unexpected media endpoint. Tokens are only sent to Pika.");
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type))
      throw new Error("Choose a JPEG, PNG, GIF, or WebP image.");
    const form = new FormData();
    form.append("file", file, name);
    return this.location(await this.request(endpoint, "POST", form));
  }
  async preview(url: string): Promise<Blob> {
    const safe = new URL(httpsURL(url));
    if (safe.origin !== "https://pika.page" || !safe.pathname.startsWith("/micropub/media/"))
      throw new Error("Authenticated previews are limited to Pika media URLs.");
    const blob = await (await this.request(safe.href, "GET")).blob();
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(blob.type))
      throw new Error("Pika did not return a supported image.");
    return blob;
  }
}
