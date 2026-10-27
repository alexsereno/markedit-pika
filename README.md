# MarkEdit-pika

Draft syncing and publishing to [Pika](https://pika.page/) for [MarkEdit](https://github.com/MarkEdit-app/MarkEdit), built with [markedit-api](https://github.com/MarkEdit-app/MarkEdit-api) and Pika’s [Micropub API](https://pika.page/manual/micropub).

Requires MarkEdit 1.37.0 or later and a Pika account. Create an app token using [Pika’s setup instructions](https://pika.page/manual/micropub#setup), then connect when prompted.

## Configuration

Open **Extensions > Pika** to configure:

- **Sync to Pika…**: Save the document and send it to Pika with `Control–Option–Command–B`. New posts ask for a title and optional publication date, then become private drafts. Existing drafts sync directly.
- **Manage Post…**: Open the linked post, publish it, return it to draft, move it to trash, or restore it. Available actions follow the post’s state. Publishing requires confirmation, then saves the document, syncs its current text and images, and publishes it. The result opens on the live site.
- **Account…**: Replace the app token for the same blog without losing post links, or disconnect to switch blogs.

A leading Markdown heading supplies the suggested title. JPEG, PNG, GIF, and WebP images upload automatically; unchanged images reuse prior uploads. Markdown formatting, embed links, and `pikahtml` blocks are preserved. Tags already on Pika are left alone.

Updating a public post requires confirmation. Syncing a trashed post offers to restore it and sync the latest changes as a draft. Saving normally in MarkEdit only saves the local file; posts sync when you choose a Pika action.

Post links, upload history, and recovery records are remembered in `markedit-pika.settings.json` beside the installed script. This file can contain private post text; do not share it. App tokens are stored in macOS Keychain, and MarkEdit asks permission to read them. See the [guide](docs/guide.md) for privacy, recovery behavior, and limitations.

To update, replace the installed JavaScript with the latest release and restart MarkEdit. Keep the settings file to preserve post links. Updates do not create numbered backups. To remove the extension, disconnect first, delete its JavaScript, and restart MarkEdit; optionally delete its settings. Local Markdown files and Pika posts are preserved.

## Building

Requires Bun 1.4.x.

```sh
bun install --frozen-lockfile
bun run check
```

The bundle is written to `dist/markedit-pika.js`. Copy it to MarkEdit’s `scripts` folder to install your build, or run `bun run install:markedit`.

`bun run check` runs lint, type-checking, tests, and the build. On macOS with Swift command-line tools, run `bun run test:webkit` to test the built bundle in WebKit. Pika mutations in that harness are mocked; see the [release checks](docs/release-checks.md) for live acceptance testing.
