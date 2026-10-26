import { describe, expect, test } from "bun:test";
import { ENDPOINT, MEDIA, Pika, PikaError, validateProperties, validateUpdate } from "../src/api";

function mock(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  }) as typeof fetch;
  return { client: new Pika("secret-test-token", transport), calls };
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers });
const body = (calls: ReturnType<typeof mock>["calls"], index = 0) =>
  JSON.parse(String(calls[index].init.body));

describe("Pika complete API", () => {
  test("creates all supported properties and returns custom-domain Location", async () => {
    const { client, calls } = mock([
      new Response(null, { status: 201, headers: { Location: "https://blog.example/posts/test" } }),
    ]);
    const properties = {
      content: ["Hello\n\n```pikahtml\n<b>HTML</b>\n```"],
      name: ["Title"],
      category: ["one", "two"],
      "post-status": ["draft" as const],
      published: ["2026-10-26T12:00:00Z"],
      photo: [{ value: "https://example.com/image.jpg", alt: "Garden" }],
    };
    expect(await client.create(properties)).toBe("https://blog.example/posts/test");
    expect(body(calls)).toEqual({ type: ["h-entry"], properties });
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer secret-test-token",
      "Content-Type": "application/json",
    });
    expect(calls[0].init.redirect).toBe("error");
    expect(calls[0].init.credentials).toBe("omit");
  });
  test("updates replace, add, delete values and entire properties", async () => {
    const { client, calls } = mock([
      json({ properties: { content: ["new"] } }),
      json({ name: ["new"] }),
    ]);
    const ops = {
      replace: { content: ["new"] },
      add: { category: ["a"], photo: ["https://example.com/a.png"] },
      delete: { category: ["old"] },
    };
    expect(await client.update("https://blog.example/post", ops)).toEqual({
      properties: { content: ["new"] },
    });
    expect(body(calls)).toEqual({ action: "update", url: "https://blog.example/post", ...ops });
    await client.update("https://blog.example/post", { delete: ["published", "name"] });
    expect(body(calls, 1).delete).toEqual(["published", "name"]);
  });
  test("delete and undelete accept 204 with no JSON", async () => {
    const { client, calls } = mock([
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    ]);
    await client.trash("https://blog.example/post");
    await client.restore("https://blog.example/post");
    expect(body(calls).action).toBe("delete");
    expect(body(calls, 1).action).toBe("undelete");
  });
  test("queries config and URL-encoded partial source", async () => {
    const { client, calls } = mock([
      json({ "media-endpoint": MEDIA }),
      json({
        properties: {
          content: ["https://open.spotify.com/album/1\n\n```pikahtml\n<div>hi</div>\n```"],
        },
      }),
    ]);
    expect((await client.config())["media-endpoint"]).toBe(MEDIA);
    const result = await client.source("https://custom.example/post?a=1&b=2", ["content", "name"]);
    const url = new URL(calls[1].url);
    expect(url.searchParams.get("url")).toBe("https://custom.example/post?a=1&b=2");
    expect(url.searchParams.getAll("properties[]")).toEqual(["content", "name"]);
    expect(result.properties.content?.[0]).toContain("pikahtml");
  });
  test("reads service metadata without treating it as writable post properties", async () => {
    const metadata = {
      content: ["Draft body"],
      "post-status": ["draft"],
      url: ["https://blog.example/post"],
      "service-metadata": { id: 123 },
    };
    const { client, calls } = mock([
      json({ properties: metadata }),
      json({ properties: { ...metadata, "post-status": ["published"] } }),
      json({ ...metadata, "post-status": ["published"] }),
    ]);
    const source = await client.source("https://blog.example/post");
    expect(source.url).toBe("https://blog.example/post");
    expect(source.properties).toEqual({
      content: ["Draft body"],
      "post-status": ["draft"],
    });
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await client.update("https://blog.example/post", {
            replace: { "post-status": ["published"] },
          })
        ).properties,
      ).toEqual({ content: ["Draft body"], "post-status": ["published"] });
      expect(body(calls, i + 1).replace).not.toHaveProperty("url");
    }
    expect(() => validateProperties({ url: ["https://blog.example/post"] })).toThrow("Unsupported");
  });
  test("retains canonical live URLs from update metadata and Location", async () => {
    const { client } = mock([
      json({
        properties: { "post-status": ["published"] },
        url: "https://custom.example/posts/live",
      }),
      json({ "post-status": ["published"] }, 200, {
        Location: "https://custom.example/posts/live",
      }),
    ]);
    for (let i = 0; i < 2; i++) {
      const result = await client.update("https://pika.page/posts/123/edit", {
        replace: { "post-status": ["published"] },
      });
      expect(result.url).toBe("https://custom.example/posts/live");
      expect(result.properties).not.toHaveProperty("url");
    }
  });
  test("source still rejects malformed writable fields", async () => {
    const { client } = mock([
      json({ properties: { url: ["https://blog.example/post"], content: "bad" } }),
    ]);
    await expect(client.source("https://blog.example/post")).rejects.toThrow("array");
  });
  test("multipart uploads preserve filename and omit manual multipart header", async () => {
    const { client, calls } = mock([
      new Response(null, { status: 201, headers: { Location: "/micropub/media/a" } }),
    ]);
    expect(await client.upload(new Blob(["png"], { type: "image/png" }), "garden.png")).toBe(
      `${MEDIA}/a`,
    );
    const data = calls[0].init.body as FormData;
    expect((data.get("file") as File).name).toBe("garden.png");
    expect(calls[0].init.headers).not.toHaveProperty("Content-Type");
  });
  test("authenticated preview never leaks tokens to other hosts or redirects", async () => {
    const { client, calls } = mock([
      new Response("png", { headers: { "Content-Type": "image/png" } }),
    ]);
    await expect(client.preview("https://evil.example/micropub/media/a")).rejects.toThrow(
      "limited",
    );
    await expect(
      client.upload(
        new Blob(["png"], { type: "image/png" }),
        "a.png",
        "https://evil.example/media",
      ),
    ).rejects.toThrow("Unexpected");
    expect(calls).toHaveLength(0);
    expect((await client.preview(`${MEDIA}/a`)).type).toBe("image/png");
    expect(calls[0].init.headers).toHaveProperty("Authorization");
  });
  test("rejects unsupported properties and malformed metadata before networking", async () => {
    expect(() => validateProperties({ unknown: ["x"] })).toThrow("Unsupported");
    expect(() => validateProperties({ "post-status": ["scheduled"] })).toThrow(
      "draft or published",
    );
    expect(() => validateProperties({ published: ["yesterday"] })).toThrow("ISO");
    expect(() => validateProperties({ photo: [{ value: "javascript:alert(1)" }] })).toThrow(
      "HTTPS",
    );
    expect(() => validateUpdate({ action: "delete" })).toThrow("Unsupported");
    expect(() => validateUpdate({ delete: ["unknown"] })).toThrow("Unknown");
    const { client, calls } = mock([]);
    await expect(client.create({ content: [" "] })).rejects.toThrow("Write a post");
    await expect(
      client.upload(new Blob(["svg"], { type: "image/svg+xml" }), "a.svg"),
    ).rejects.toThrow("JPEG");
    expect(calls).toHaveLength(0);
  });
  test.each([
    [401, "unauthorized", "Reconnect"],
    [403, "insufficient_scope", "permission"],
    [403, "forbidden", "limit"],
    [404, "invalid_request", "not found"],
    [422, "invalid_request", "rejected"],
  ])("handles %s %s", async (status, code, message) => {
    const { client } = mock([
      json({ error: code, error_description: "Useful detail", scope: "delete" }, status as number),
    ]);
    await expect(client.config()).rejects.toThrow(message as string);
  });
  test("429 enforces Retry-After without automatic retries", async () => {
    const { client, calls } = mock([json({}, 429, { "Retry-After": "120" })]);
    const start = Date.now();
    try {
      await client.config();
      throw new Error("Should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(PikaError);
      expect((error as PikaError).retryAt).toBeGreaterThanOrEqual(start + 120_000);
    }
    await expect(client.config()).rejects.toThrow("rate limiting");
    expect(calls).toHaveLength(1);
  });
  test("unavailable Location and malformed successful updates require recovery", async () => {
    const { client } = mock([
      new Response(null, { status: 201 }),
      new Response("not JSON", { status: 200 }),
    ]);
    await expect(client.create({ content: ["hello"] })).rejects.toThrow("Location");
    await expect(
      client.update("https://blog.example/post", { replace: { content: ["new"] } }),
    ).rejects.toThrow("accepted the update");
  });
  test("network failure never automatically resends a mutation", async () => {
    let calls = 0;
    const client = new Pika("token", (async () => {
      calls++;
      throw new Error("Disconnected");
    }) as unknown as typeof fetch);
    await expect(client.create({ content: ["hello"] })).rejects.toThrow("may have received");
    expect(calls).toBe(1);
  });
});

test("calls browser fetch with the global receiver WebKit requires", async () => {
  let receiver: unknown;
  const transport = function (this: unknown) {
    receiver = this;
    return Promise.resolve(new Response(JSON.stringify({ "media-endpoint": MEDIA })));
  } as unknown as typeof fetch;
  await new Pika("dummy", transport).config();
  expect(receiver).toBe(globalThis);
});

test("response-body stalls time out and mutations are never retried", async () => {
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const transport = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    signal = init?.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"properties":'));
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const client = new Pika("dummy", transport, 25);
  await expect(
    client.update("https://blog.example/post", {
      replace: { content: ["saved"] },
    }),
  ).rejects.toThrow("may have received");
  expect(signal?.aborted).toBe(true);
  expect(calls).toBe(1);
});

test("a fetch that never returns headers also has a bounded deadline", async () => {
  const client = new Pika("dummy", (() => new Promise(() => {})) as unknown as typeof fetch, 25);
  await expect(client.config()).rejects.toThrow("Could not reach");
});
