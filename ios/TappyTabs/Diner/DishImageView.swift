import CoreImage
import CryptoKit
import SwiftUI
import Vision

/// Frames a menu photo around its visually salient dish and shares the normalized image.
struct DishImageView: View {
    private static let tileSide: CGFloat = 220
    let urlString: String?
    let isAlreadyProcessed: Bool
    let onProcessedImage: (Data) -> Void

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: Self.tileSide, height: Self.tileSide)
                    .clipped()
            } else {
                Image(systemName: "fork.knife")
                    .font(.system(size: 34))
                    .foregroundStyle(.secondary)
                    .frame(width: Self.tileSide, height: Self.tileSide)
            }
        }
        .frame(width: Self.tileSide, height: Self.tileSide)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .background(Theme.card.opacity(0.7))
        .task(id: urlString) { await load() }
    }

    @MainActor
    private func load() async {
        guard let urlString, let url = URL(string: urlString), url.scheme == "https" else { return }
        let cacheKey = "dish-image-v5:\(urlString)"
        if let cached = await DishImageCache.shared.data(for: cacheKey), let image = UIImage(data: cached) {
            self.image = image
            if !isAlreadyProcessed { onProcessedImage(cached) }
            return
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 12
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode),
                  data.count <= 12 * 1024 * 1024, let sourceImage = UIImage(data: data),
                  var cgImage = sourceImage.cgImage else { return }
            if sourceImage.imageOrientation != .up {
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1
                let size = sourceImage.size
                let renderer = UIGraphicsImageRenderer(size: size, format: format)
                cgImage = renderer.image { _ in
                    sourceImage.draw(in: CGRect(origin: .zero, size: size))
                }.cgImage ?? cgImage
            }
            if let normalizedData = await Task.detached(priority: .utility, operation: { Self.normalize(cgImage) }).value,
               let normalizedImage = UIImage(data: normalizedData) {
                image = normalizedImage
                await DishImageCache.shared.store(normalizedData, for: cacheKey)
                if !isAlreadyProcessed { onProcessedImage(normalizedData) }
            } else {
                // Keep the original photo usable when saliency detection or normalization fails.
                image = sourceImage
            }
        } catch {
            // Keep the card usable if the restaurant image host is unavailable.
        }
    }

    nonisolated private static func normalize(_ cgImage: CGImage) -> Data? {
        let sourceWidth = CGFloat(cgImage.width)
        let sourceHeight = CGFloat(cgImage.height)
        guard sourceWidth > 0, sourceHeight > 0 else { return nil }

        let source = CIImage(cgImage: cgImage)
        let sourceRect = CGRect(x: 0, y: 0, width: sourceWidth, height: sourceHeight)
        let targetAspect: CGFloat = 1
        var cropRect = centeredCrop(in: sourceRect, aspect: targetAspect)

        do {
            let request = VNGenerateAttentionBasedSaliencyImageRequest()
            let handler = VNImageRequestHandler(cgImage: cgImage)
            try handler.perform([request])
            if let observation = request.results?.first,
               let salient = observation.salientObjects?.max(by: { $0.boundingBox.area < $1.boundingBox.area }) {
                let subject = CGRect(
                    x: salient.boundingBox.minX * sourceWidth,
                    y: salient.boundingBox.minY * sourceHeight,
                    width: salient.boundingBox.width * sourceWidth,
                    height: salient.boundingBox.height * sourceHeight
                )
                let area = subject.width * subject.height / (sourceWidth * sourceHeight)
                if (0.02...0.94).contains(area) {
                    cropRect = cropAround(subject, in: sourceRect, aspect: targetAspect)
                }
            }
        } catch {
            // A centered crop still produces a consistent, usable menu image.
        }

        let cropped = source.cropped(to: cropRect)
        let canvasRect = CGRect(x: 0, y: 0, width: 512, height: 512)
        let scale = min(canvasRect.width / cropRect.width, canvasRect.height / cropRect.height)
        let scaled = cropped.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let centered = scaled.transformed(by: CGAffineTransform(
            translationX: (canvasRect.width - scaled.extent.width) / 2 - scaled.extent.minX,
            y: (canvasRect.height - scaled.extent.height) / 2 - scaled.extent.minY
        ))
        let output = centered.composited(over: CIImage(color: .clear).cropped(to: canvasRect)).cropped(to: canvasRect)
        guard let cgOutput = CIContext(options: [.useSoftwareRenderer: false]).createCGImage(output, from: canvasRect),
              cgOutput.width == 512, cgOutput.height == 512,
              let png = UIImage(cgImage: cgOutput).pngData() else {
            return squareFallbackPNG(cgImage)
        }
        return png
    }

    /// Fallback that always emits a true square when Vision or Core Image can't normalize the photo.
    nonisolated private static func squareFallbackPNG(_ cgImage: CGImage) -> Data? {
        let side = CGFloat(min(cgImage.width, cgImage.height))
        let width = CGFloat(cgImage.width)
        let height = CGFloat(cgImage.height)
        guard side > 0,
              let crop = cgImage.cropping(to: CGRect(
                x: (width - side) / 2,
                y: (height - side) / 2,
                width: side,
                height: side
              )),
              let context = CGContext(
                data: nil,
                width: 512,
                height: 512,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else { return nil }
        context.interpolationQuality = .high
        context.draw(crop, in: CGRect(x: 0, y: 0, width: 512, height: 512))
        guard let square = context.makeImage() else { return nil }
        return UIImage(cgImage: square).pngData()
    }

    /// Returns the largest square crop that fits entirely inside the source photo.
    nonisolated private static func centeredCrop(in rect: CGRect, aspect: CGFloat) -> CGRect {
        let width = min(rect.width, rect.height * aspect)
        let height = width / aspect
        return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
    }

    /// Scales the detected dish consistently while keeping the crop within the source photo.
    nonisolated private static func cropAround(_ subject: CGRect, in source: CGRect, aspect: CGFloat) -> CGRect {
        let padding: CGFloat = 1.5
        let side = min(max(subject.width, subject.height) * padding, min(source.width, source.height))
        let width = side * aspect
        let height = side
        let originX = min(max(subject.midX - width / 2, source.minX), source.maxX - width)
        let originY = min(max(subject.midY - height / 2, source.minY), source.maxY - height)
        return CGRect(x: originX, y: originY, width: width, height: height)
    }
}

private extension CGRect {
    var area: CGFloat { width * height }
}

private actor DishImageCache {
    static let shared = DishImageCache()
    private let directory: URL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("DishImages", isDirectory: true)

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
