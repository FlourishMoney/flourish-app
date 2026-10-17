import Capacitor
import UIKit

// The app's bridge, with the plugins that live in this project rather than in an npm package
// (Capacitor's "custom plugin" registration). SceneDelegate makes this the root view controller.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FlourishReviewPlugin())
    }
}
