import ExpoModulesCore
import QuickLook

public class MarkovMobileWebShellModule: Module {
  private var pdfPreview: MobileWebShellPdfPreview?

  public func definition() -> ModuleDefinition {
    Name("MarkovMobileWebShell")

    AsyncFunction("presentPdf") { (url: URL) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw PdfPresenterUnavailableException()
      }
      let preview = MobileWebShellPdfPreview(url: url)
      let controller = QLPreviewController()
      controller.dataSource = preview
      self.pdfPreview = preview
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("shareImage") { (url: URL, _: String) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw ImagePresenterUnavailableException()
      }
      presentImageShareSheet(url: url, from: presenter)
    }.runOnQueue(.main)

    AsyncFunction("saveImageToPhotos") { (url: URL, _: String, promise: Promise) in
      saveImageToPhotoLibrary(url: url, promise: promise)
    }

    View(MarkovMobileWebShellView.self) {
      Events("onLoadState", "onBridgeMessage", "onExternalNavigation", "onBackEdgeSwipe")

      Prop("generationDirectory") { (view: MarkovMobileWebShellView, value: String) in
        view.setGenerationDirectory(value)
      }

      Prop("sessionId") { (view: MarkovMobileWebShellView, value: String) in
        view.setSessionId(value)
      }

      Prop("bridgeEnabled") { (view: MarkovMobileWebShellView, value: Bool) in
        view.setBridgeEnabled(value)
      }

      Prop("backEdgeSwipe") { (view: MarkovMobileWebShellView, value: Bool) in
        view.setBackEdgeSwipe(value)
      }

      AsyncFunction("postBridgeMessage") {
        (view: MarkovMobileWebShellView, json: String, promise: Promise) in
        try view.postBridgeMessage(json, promise: promise)
      }

      OnViewDidUpdateProps { (view: MarkovMobileWebShellView) in
        view.propsDidUpdate()
      }
    }
  }
}
