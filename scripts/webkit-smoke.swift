import AppKit
import WebKit

final class Smoke: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  var web: WKWebView!
  var window: NSWindow!
  func start(_ path: String) {
    let config = WKWebViewConfiguration()
    config.perform(NSSelectorFromString("_setCORSDisablingPatterns:"), with: ["http://*/*", "https://*/*", "*://*/*"] as NSArray)
    config.userContentController.add(self, name: "result")
    config.userContentController.add(self, name: "log")
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700), configuration: config)
    window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 900, height: 700), styleMask: [.titled, .closable], backing: .buffered, defer: false)
    window.appearance = NSAppearance(named: ProcessInfo.processInfo.environment["PIKA_SMOKE_DARK"] == "1" ? .darkAqua : .aqua)
    window.title = "MarkEdit Pika — WebKit validation"
    window.contentView = web
    window.orderFront(nil)
    web.navigationDelegate = self
    guard let html = try? String(contentsOfFile: path, encoding: .utf8) else { print("Could not read test page"); exit(1) }
    // Match MarkEdit's real loading mode, not file://, which exposes different APIs.
    web.loadHTMLString(html, baseURL: URL(string: "http://localhost/"))
    DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("WebKit smoke test timed out"); exit(1) }
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    print(message.body)
    if message.name == "log" { return }
    if let body = message.body as? String, body.contains("\"ok\":true") {
      web.takeSnapshot(with: nil) { image, _ in
        if let image = image, let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
          try? png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]).deletingLastPathComponent().appendingPathComponent(ProcessInfo.processInfo.environment["PIKA_SMOKE_DARK"] == "1" ? "preview-dark.png" : "preview.png"))
        }
        exit(0)
      }
      return
    }
    exit(1)
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print(error); exit(1) }
}
let app = NSApplication.shared
let smoke = Smoke()
smoke.start(CommandLine.arguments[1])
app.run()
