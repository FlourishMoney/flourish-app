import Foundation
import CoreImage
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = CIImage(contentsOf: url) else { print("no image"); exit(2) }
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
let found = det.features(in: img).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
print(found.isEmpty ? "NO QR FOUND" : found.joined(separator: "\n"))
