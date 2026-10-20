import Capacitor
import StoreKit
import UIKit

// The store review prompt (version 1.1, item 4), on Apple's current API: AppStore.requestReview(in:),
// StoreKit, iOS 16 and later. Never the old SKStoreReviewController. On iOS 15 nothing is asked: the
// current API does not exist there, and the old one is the one being retired.
// When to ask is decided in src/lib/reviewRules.js; this only asks, and Apple decides whether to show it.
@objc(FlourishReviewPlugin)
public class FlourishReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlourishReviewPlugin"
    public let jsName = "FlourishReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard #available(iOS 16.0, *) else {
                call.resolve(["asked": false])
                return
            }
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.resolve(["asked": false])
                return
            }
            AppStore.requestReview(in: scene)
            call.resolve(["asked": true])
        }
    }
}
