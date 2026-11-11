package expo.modules.markovmobilewebshell

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MarkovMobileWebShellModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MarkovMobileWebShell")

    // Takes a FileProvider content:// URI; the grant lets the chosen viewer read Markov's cache file.
    AsyncFunction("presentPdf") { uri: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(uri), "application/pdf")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      try {
        activity.startActivity(intent)
      } catch (error: ActivityNotFoundException) {
        // The bridge forwards this code to the page as a refusal it can name.
        throw CodedException("native_pdf_no_viewer", "No installed app opens PDFs", error)
      }
    }

    AsyncFunction("shareImage") { uri: String, mime: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      presentImageShareSheet(activity, Uri.parse(uri), mime)
    }

    AsyncFunction("saveImageToPhotos") { uri: String, mime: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      saveImageToGallery(context, Uri.parse(uri), mime)
    }

    View(MarkovMobileWebShellView::class) {
      Events("onLoadState", "onBridgeMessage", "onExternalNavigation")

      Prop("generationDirectory") { view: MarkovMobileWebShellView, value: String ->
        view.setGenerationDirectory(value)
      }

      Prop("sessionId") { view: MarkovMobileWebShellView, value: String ->
        view.setSessionId(value)
      }

      Prop("bridgeEnabled") { view: MarkovMobileWebShellView, value: Boolean ->
        view.setBridgeEnabled(value)
      }

      AsyncFunction("postBridgeMessage") { view: MarkovMobileWebShellView, json: String ->
        view.postBridgeMessage(json)
      }

      OnViewDidUpdateProps { view: MarkovMobileWebShellView ->
        view.propsDidUpdate()
      }

      OnViewDestroys { view: MarkovMobileWebShellView ->
        view.destroyWebView()
      }
    }
  }
}
