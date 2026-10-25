import CoreImage
import CoreImage.CIFilterBuiltins
import CryptoKit
import SwiftUI
import Vision

/// Loads a menu photo once per device, removes its background, and reports the PNG
/// so the first diner to view it can cache the cutout in Convex Storage for everyone.
struct DishCutoutImage: View {
    let urlString: String?
    let isCutout: Bool
    let onCutout: (Data) -> Void

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(6)
            } else {
                Image(systemName: "fork.knife")
                    .font(.system(size: 34))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.card.opacity(0.7))
        .task(id: urlString) { await load() }
    }

    @MainActor
    private func load() async {
        guard let urlString, let url = URL(string: urlString), url.scheme == "https" else { return }
        if let cached = await DishImageCache.shared.data(for: urlString), let image = UIImage(data: cached) {
            self.image = image
            if !isCutout { onCutout(cached) }
            return
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 12
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                  data.count <= 12 * 1024 * 1024, let sourceImage = UIImage(data: data), let cgImage = sourceImage.cgImage else { return }
            if isCutout {
                image = sourceImage
                await DishImageCache.shared.store(data, for: urlString)
            } else if let png = await Task.detached(priority: .utility, operation: { Self.segment(cgImage) }).value {
                guard let cutout = UIImage(data: png) else { return }
                image = cutout
                await DishImageCache.shared.store(png, for: urlString)
                onCutout(png)
            } else {
                image = sourceImage
            }
        } catch {
            // Keep the card usable if the restaurant image host is unavailable.
        }
    }

    nonisolated private static func segment(_ cgImage: CGImage) -> Data? {
        let request = VNGenerateForegroundInstanceMaskRequest()
        do {
            let handler = VNImageRequestHandler(cgImage: cgImage)
            try handler.perform([request])
            guard let observation = request.results?.first else { return nil }
            let mask = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
            let foreground = CIImage(cgImage: cgImage)
            let background = CIImage(color: .clear).cropped(to: foreground.extent)
            let blend = CIFilter.blendWithMask()
            blend.inputImage = foreground
            blend.backgroundImage = background
            blend.maskImage = CIImage(cvPixelBuffer: mask)
            guard let output = blend.outputImage,
                  let cgOutput = CIContext(options: [.useSoftwareRenderer: false]).createCGImage(output, from: foreground.extent) else { return nil }
            return UIImage(cgImage: cgOutput).pngData()
        } catch {
            return nil
        }
    }
}

private actor DishImageCache {
    static let shared = DishImageCache()
    private let directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("DishCutouts", isDirectory: true)

    func data(for key: String) -> Data? {
        try? Data(contentsOf: file(for: key))
    }

    func store(_ data: Data, for key: String) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: file(for: key), options: .atomic)
    }

    private func file(for key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(digest)
    }
}
