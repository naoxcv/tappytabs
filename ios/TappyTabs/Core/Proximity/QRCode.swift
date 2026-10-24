// Owner: Role 2. QR fallback: tappytabs://join/<joinCode>. Works from the in-app scanner and the system Camera.
import AVFoundation
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

enum JoinLink {
    static func url(joinCode: String) -> URL { URL(string: "tappytabs://join/\(joinCode)")! }

    /// tappytabs://join/ABC234 → "ABC234"
    static func joinCode(from url: URL) -> String? {
        guard url.scheme == "tappytabs", url.host == "join" else { return nil }
        let code = url.pathComponents.dropFirst().first ?? ""
        return code.isEmpty ? nil : code.uppercased()
    }
}

enum QRCode {
    static func image(for string: String, scale: CGFloat = 10) -> UIImage {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        let context = CIContext()
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
              let cg = context.createCGImage(output, from: output.extent) else { return UIImage() }
        return UIImage(cgImage: cg)
    }
}

struct QRImage: View {
    let joinCode: String
    var body: some View {
        Image(uiImage: QRCode.image(for: JoinLink.url(joinCode: joinCode).absoluteString))
            .interpolation(.none).resizable().scaledToFit()
    }
}

/// Camera scanner; calls onCode once with the first tappytabs join code it sees.
struct QRScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerController {
        let vc = ScannerController()
        vc.onCode = onCode
        return vc
    }
    func updateUIViewController(_ vc: ScannerController, context: Context) {}

    final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: ((String) -> Void)?
        private let session = AVCaptureSession()
        private var done = false

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else { return }
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.layer.bounds
            view.layer.addSublayer(preview)
            DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            session.stopRunning()
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard !done, let s = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue,
                  let url = URL(string: s), let code = JoinLink.joinCode(from: url) else { return }
            done = true
            onCode?(code)
        }
    }
}
