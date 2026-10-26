# Release checks

Run `bun install --frozen-lockfile`, `bun run check`, `bun run test:webkit`, and `bun audit` on the release source. Distribute only the generated `dist/markedit-pika.js`; its license notices are embedded. Never include installed settings, Keychain data, `.test-output`, or personal Markdown documents.

The automated WKWebView run starts with empty settings and an empty mock Keychain. It covers fresh setup and the post lifecycle, including a draft editor URL becoming a custom-domain live URL. A second browsing context holds the operation lock while another attempts to sync; the competing sync must send no mutation. These are mocked authenticated mutations, not a claim that a real Pika account has been tested.

## Compatibility

The local native interfaces were inspected in MarkEdit 1.37.0 on macOS 27.0.1. The WebKit harness runs on that machine with Web Locks deliberately absent, matching the actual MarkEdit WebView. IndexedDB availability was also checked inside MarkEdit itself. Older MarkEdit/macOS combinations are not certified. The extension requires Keychain, save-document, contextual-menu, cross-origin networking, and IndexedDB support and stops incompatible commands before sending posts. Before claiming a lower minimum version, install and test that exact combination.

## Live acceptance

Use a dedicated Pika test blog and a new Markdown document rather than an existing personal post. The test includes a briefly public post, so choose content appropriate for public viewing.

- Install the generated script in MarkEdit's scripts folder, restart MarkEdit, and connect through its native Keychain approval flow.
- Start with an unsaved document. Add a title, text, and a local image. Choose Sync, spend several seconds naming the file in the native Save panel, then save it. The flow must continue without asking you to save again. Complete Save Draft; verify the file is saved, exactly one private draft exists, and the uploaded image and formatting render correctly.
- Make edits, add another image, and choose Publish directly. Confirm once. Verify that the file is saved and the new text and image are synced before the post becomes public. Open the result; it must open the live URL and close the modal. Test a Pika subdomain and a custom domain where available.
- Update the live post; verify the confirmation, unchanged publication date, and correct live content.
- Move the post to trash, change the document, and choose Sync. Test cancel, then Restore and Sync. Verify one restored private draft with the latest changes.
- Renew the app token through Replace Token. Verify that links and upload history remain intact. A token for another blog must not be silently treated as a verified renewal.
- In two actual MarkEdit windows, start overlapping operations. Verify the busy message, no duplicate mutations, and preserved associations. The automated test covers two browsing contexts; this verifies the app's actual window configuration too.
- Test denied/canceled Keychain access, revoked tokens, canceled document saves, unavailable images, and offline operation. No failed sync may proceed to publication, and uncertain requests must not be retried automatically.
- Interrupt an operation, then open a different document. Verify recovery names and updates the original document, describes the correct action, and does not attach the result to the other document.
- Remove or trash only the disposable test post afterward. Disconnect and remove the disposable script/settings when testing uninstall. Verify that local Markdown and remote posts are not deleted by uninstalling the extension.

Record the app/macOS versions and results against the tagged release. Any checks that have not been performed remain pending; do not describe mocked checks as live acceptance.
