import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

struct Layer {
    let color: CGColor
    let path: CGPath
}

func path(_ source: String) -> CGPath {
    let scanner = Scanner(string: source)
    let result = CGMutablePath()
    func point() -> CGPoint {
        guard let horizontal = scanner.scanDouble(), let vertical = scanner.scanDouble() else {
            preconditionFailure("Invalid artwork path")
        }
        return CGPoint(x: horizontal, y: vertical)
    }
    while !scanner.isAtEnd {
        if scanner.scanString("M") != nil { result.move(to: point()) }
        else if scanner.scanString("C") != nil {
            let first = point(), second = point(), end = point()
            result.addCurve(to: end, control1: first, control2: second)
        } else if scanner.scanString("Z") != nil { result.closeSubpath() }
        else { preconditionFailure("Unsupported artwork command") }
    }
    return result
}

func layers(at url: URL) throws -> [Layer] {
    let source = try String(contentsOf: url, encoding: .utf8)
    let expression = try NSRegularExpression(pattern: #"<path\b[^>]*fill="(#[0-9a-fA-F]{6})"[^>]*\bd="([^"]+)""#)
    return expression.matches(in: source, range: NSRange(source.startIndex..., in: source)).map { match in
        let hex = String(source[Range(match.range(at: 1), in: source)!].dropFirst())
        let value = UInt32(hex, radix: 16)!
        let components: [CGFloat] = [CGFloat((value >> 16) & 255) / 255,
                                    CGFloat((value >> 8) & 255) / 255, CGFloat(value & 255) / 255, 1]
        return Layer(color: CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: components)!,
                     path: path(String(source[Range(match.range(at: 2), in: source)!])))
    }
}

func transformed(_ layers: [Layer], by transform: CGAffineTransform) -> [Layer] {
    var transform = transform
    return layers.map { Layer(color: $0.color, path: $0.path.copy(using: &transform)!) }
}

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let sources = ["assets/agent-characters/icons/cat.svg", "assets/spice-levels/spice-1-mild.svg",
               "assets/spice-levels/spice-2-medium.svg", "assets/spice-levels/spice-3-hot.svg",
               "assets/spice-levels/spice-4-inferno.svg"]
let drawings = try sources.map { try layers(at: root.appendingPathComponent($0)) }
precondition(drawings.allSatisfy { $0.count >= 4 })
let hat = Array(drawings[1].suffix(2))
let reference = hat[0].path.boundingBoxOfPath
let bodies = drawings.map { drawing -> [Layer] in
    let bounds = drawing[drawing.count - 2].path.boundingBoxOfPath
    let alignment = CGAffineTransform(translationX: reference.midX, y: reference.midY)
        .scaledBy(x: reference.width / bounds.width, y: reference.height / bounds.height)
        .translatedBy(x: -bounds.midX, y: -bounds.midY)
    return transformed(Array(drawing.dropLast(2)), by: alignment)
}
let bounds = (bodies.flatMap { $0 } + hat).reduce(CGRect.null) { $0.union($1.path.boundingBoxOfPath) }
let scale = min(1, 896 / max(bounds.width, bounds.height))
let framing = CGAffineTransform(translationX: 512, y: 512)
    .scaledBy(x: scale, y: scale)
    .translatedBy(x: -bounds.midX, y: -bounds.midY)
let assets = root.appendingPathComponent("ios/TappyTabs/Resources/Assets.xcassets")

func save(_ layers: [Layer], name: String) throws {
    let folder = assets.appendingPathComponent("\(name).imageset")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.translateBy(x: 0, y: 1024)
    context.scaleBy(x: 1, y: -1)
    context.concatenate(framing)
    for layer in layers {
        context.addPath(layer.path)
        context.setFillColor(layer.color)
        context.drawPath(using: .eoFill)
    }
    let destination = CGImageDestinationCreateWithURL(folder.appendingPathComponent("artwork.png") as CFURL,
                                                      UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, context.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(destination))
    let contents: [String: Any] = ["images": [["filename": "artwork.png", "idiom": "universal"]],
                                   "info": ["author": "xcode", "version": 1]]
    try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
        .write(to: folder.appendingPathComponent("Contents.json"))
}

for (index, body) in bodies.enumerated() { try save(body, name: "spice_layer_\(index)") }
try save(hat, name: "spice_hat")
print("Prepared five aligned bodies and one shared hat, preserving transparent cut-outs.")
