# MarkEdit Pika

Write in MarkEdit. Sync to Pika.

## Install

Requires MarkEdit 1.37.0 or later and a Pika account with an app token.

Download [markedit-pika.js](https://github.com/alexsereno/markedit-pika/releases/latest/download/markedit-pika.js) and copy it into:

```text
~/Library/Containers/app.cyan.markedit/Data/Documents/scripts/
```

Restart MarkEdit, then choose **Extensions → Pika → Sync to Pika…** (Control–Option–Command–B).

On first use, paste an app token and click **Connect**. **Get an app token** opens [Pika’s setup instructions](https://pika.page/manual/micropub#setup) in your browser while keeping the connection sheet open. Tokens are stored in macOS Keychain; MarkEdit asks permission to read them. No blog URL is needed.

## Write and publish

Write and format your post in MarkEdit. Add images as you normally would.

For a new post, choose **Sync to Pika…**, check the suggested title, and choose **Save Draft**. For a linked draft, **Sync to Pika…** sends the current document directly to the existing draft without asking for its title or date again. The title follows the leading Markdown heading unless you chose a different title on the first sync. Updates leave the existing publication date untouched. New posts are always created as drafts, and existing drafts stay private. This sheet has no publishing action. To make a saved draft public, choose **Manage Post… → Publish…** and confirm **Publish**. That action saves the local document, syncs its current text, title, and images to the draft, then publishes it. Any save, upload, or sync failure stops publication. Canceling the confirmation keeps the draft private. A leading Markdown heading becomes the suggested title. The sheet has no second body editor: it sends the current document. Sync saves the document through MarkEdit before sending it. A new document uses the native Save dialog. If MarkEdit returns before that dialog has assigned the file path, the extension waits for the saved file and then continues automatically. This temporary wait is invisible and ends after two minutes; it is only used during the explicit save action. Escape or another Pika command cancels the pending continuation. Canceling or failing the save stops the action.

Images referenced by the document upload automatically. Relative paths resolve against the saved Markdown file. The outgoing post uses hosted image URLs; your local references remain intact. JPEG, PNG, GIF, and WebP are supported. Unchanged images reuse prior uploads. Inline images and reference images preserve their placement, alt text, and optional titles. Code examples are not uploaded. Local images in raw HTML must be written as Markdown image references; `pikahtml` blocks pass through unchanged.

Publishing also saves the local document first and stops if that save is canceled or fails. Saving in MarkEdit on its own only saves your local file. Send drafts and updates explicitly with **Sync to Pika…**. There is no automatic sync or file-change polling.

For an already-published post, Sync asks for confirmation before updating its live content, with no metadata form. Sync preserves the existing publication status. Use **Manage Post… → Return to Draft…** to take a public post offline deliberately.

On the first sync, the optional **Publication date** disclosure uses a standard date/time field. Dates are sent as ISO 8601 internally; no scheduling behavior beyond Pika’s documented publication date is assumed. Clearing a title makes the post titleless. Tags are not shown or modified by the publishing sheet; existing Pika tags are preserved.

After publishing, the same sheet shows **Publishing post…**, then **Post published.** and **Open in Pika**. The published link comes from Pika’s returned URL and opens the live site, including custom domains. Dashboard edit URLs are not used as published links. If Pika returns no live URL, the success result has no Open button. After syncing, the sheet shows a short result and **Open in Pika**, which opens the post and closes the sheet. Dismiss without opening it using MarkEdit’s circular close icon or Escape. Its close control and 160 ms dismissal follow MarkEdit’s existing preview overlay; fields and buttons use macOS system typography and colors. The sheet inherits the editor’s colors and respects reduced motion.

## Other actions

The **Pika** menu contains **Sync to Pika…**, **Manage Post…**, and **Account…**. Manage Post opens a native action menu built for the current document, rather than a fixed list of disabled commands:

- **Manage Post…** is disabled until this document has been synced to Pika.
- A draft offers **Open on Pika**, **Publish…**, **Move to Trash…**, and **Create Separate Draft…**. Publishing always requires confirmation.
- A published post also offers **Return to Draft…**.
- A post trashed through this extension offers **Restore from Trash…**. Choosing **Sync to Pika…** instead asks **Restore and Sync**, restores it as a draft, then updates it from the saved document. Canceling changes nothing on Pika. If restoration succeeds but syncing fails, the restored state is retained so the next sync does not restore it again.
- A post missing from Pika offers **Create New Draft…**.

The remote state is checked when opening the menu for a linked active post. Simply opening the menu does not acknowledge remote content changes or overwrite the conflict baseline. No file polling is involved. Importing unrelated posts and the standalone image-preview command are not shown; media preview remains available in the internal API client.

If an update discovers that the linked post no longer exists, a native confirmation offers **Create New Draft**. Accepting creates a draft from the current document and links its new URL. Cancelling keeps the old link. Authentication and connection errors never trigger replacement. An old publication date is not copied to a replacement unless explicitly edited.

**Account…** offers **Replace Token…** to renew a token for the same blog while keeping document links and uploaded-image history. The replacement token is checked against a linked active post when possible; otherwise you must confirm that it belongs to the same blog. Failed replacement writes restore the previous Keychain token. **Disconnect…** clears local associations and is the explicit way to switch blogs. Technical settings, API responses, and JSON property editing are not part of the user interface.

## API coverage

The underlying client implements all of [Pika’s documented Micropub API](https://pika.page/manual/micropub): create, update (`replace`, `add`, value deletion, whole-property deletion), trash, restore, configuration, full/partial source, media upload, and authenticated media preview. All documented properties are supported: `content`, `name`, `category`, `post-status`, `published`, and `photo`, including photo alt text.

The normal UI expresses these as publishing, metadata, document images, and menu actions. Image insertion/replacement/removal/reordering is expressed by editing the Markdown document and updating its content. There is no user-facing API console. Raw add/delete-property combinations remain available to the typed client, covered by tests. Markdown, embed links, and `pikahtml` blocks are preserved; Pika enforces Pro requirements for custom HTML.

The API does not document listing all posts, deleting uploaded media, or conditional writes. Source retrieval uses a post URL. Remote-edit checks are best effort, not atomic conflict prevention. Draft creation returns a dashboard URL, which is retained until Pika supplies the published URL. Draft URL handling is covered by the mocked lifecycle test; it also belongs in the final live acceptance check. Document associations currently use the Markdown file path; moving or renaming a file loses its association.

## Data and recovery

Non-secret local data lives beside the installed script in `markedit-pika.settings.json`: document links, synchronized properties, upload reuse, connection identity, and interrupted-send records. It can contain private post text. Do not share or commit it. The token stays in Keychain; the publishing sheet retains an approved client in memory until it closes. Manage Post reuses one approved client for the chosen action, then releases it. Opening another Pika command clears the menu approval. Because MarkEdit has no menu-dismissal callback, an unused menu approval expires after 60 seconds. Changing accounts or document associations invalidates an old menu. One Pika account is connected at a time.

Before each remote post mutation, its action, original document path, post URL when known, and start time are saved. Network failures, server errors, app closure, or local persistence failures leave a recovery record. Nothing retries automatically. The next Pika action shows **Check your last Pika action**, with instructions for the interrupted operation. Recovery updates the original document association even when another document is open. Trash recovery asks you to confirm the post is in Pika’s trash; updates, publishing, and restores can link the checked remote state. Only creation recovery offers **No post was created**. Older recovery records without a document path require you to choose the original file explicitly before linking. This recovery UI appears only when needed.

All images are read before uploading begins. If one fails, the post is not submitted. Already uploaded media may remain unused. An IndexedDB transaction atomically claims a shared operation lease across document windows. A competing action stops with a busy message. The active action renews its two-minute lease every 30 seconds, and checks ownership before remote mutations, uploads, and settings writes. A lost lease stops further writes; a crashed window’s lease expires. This does not watch document changes or local saves. Web Locks is not required; MarkEdit’s actual WebView does not expose it.

Authenticated requests go only to Pika and do not follow redirects. Upload previews only accept Pika media URLs. Rate-limit responses include a cooldown and exponential backoff in the current publishing session. The 60-second request deadline includes connection, headers, and the complete response body. A stalled download stops the action and preserves recovery state for uncertain mutations. Keychain and file access depend on permissions provided by MarkEdit and macOS.

## Development

Building requires Bun 1.4.x. End users need a MarkEdit build with Keychain secret storage, document saving, contextual menus, cross-origin `fetch`, and IndexedDB support. This checkout has been validated in WKWebView on macOS 27.0.1; the installed MarkEdit reports 1.37.0 and provides the required native interfaces. Earlier releases have not been certified. Commands fail with a feature-specific compatibility message when the required interfaces are missing. The extension uses MarkEdit’s script-scoped API. No server is required.

```sh
bun install --frozen-lockfile
bun run check
bun run test:webkit
bun run install:markedit
```

`check` runs linting, type-checking, focused API/Markdown/persistence tests, and a single-file browser build. `test:webkit` runs that built bundle in a real WKWebView with a mocked native bridge and API. It tests minimal setup, document-based publishing, automatic images, updates, cancellation, remote conflicts, post lifecycle, interrupted sends, unsaved files, icon/Escape dismissal, and context-sensitive native management actions, missing-post replacement/cancellation, draft-first syncing, published-state preservation, management-only confirmed publication, cancellation, tag preservation, explicit-only updates, published-post confirmations, and absence of file polling. The actual API client makes a real GET to Pika using a deliberately invalid dummy token, verifying authenticated-header networking and the Window receiver required by WebKit; no real posts are changed. The harness captures `.test-output/preview.png`.

Additional tests cover token-renewal rollback and link preservation, recovery across documents and operation types, compatibility failure, save/sync/publish ordering with a new image, failed-sync publication prevention, and atomic operation-lock contention from a second browsing context, expired-lease recovery, and lost-lease rejection. `bun audit` checks installed dependencies for known advisories.

Live authenticated Pika publishing and native Keychain dialogs require manual verification with a test account. See [the release checks](docs/release-checks.md). The harness does not replace that check.

The installer replaces only the extension script, preserves its settings, and does not restart MarkEdit. It does not create backup copies in the scripts folder. To remove, disconnect first, delete the installed script, and restart MarkEdit. Optionally delete its settings; local Markdown files and Pika posts are preserved.

MIT. The bundle includes third-party license notices, including MarkEdit’s preview close-control styling. See `THIRD_PARTY_NOTICES.txt`.
