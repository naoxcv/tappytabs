import SwiftUI
import UIKit

enum AgentAvatarState { case idle, thinking, happy, confused, launching }

/// Existing call sites retain their API. Small avatars use the supplied transparent PNGs.
struct AvatarView: View {
    let avatarId: String
    var size: CGFloat = 56
    var highlighted = false
    var state: AgentAvatarState = .idle
    var animated = true
    var onAnimationComplete: (() -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let name = AvatarCatalog.character(avatarId)
        Group {
            if animated && size >= 48 {
                AgentDrawing(name: name, state: state, reduceMotion: reduceMotion, active: scenePhase == .active,
                             onAnimationComplete: onAnimationComplete)
            } else {
                Image("agent_\(name)").resizable().scaledToFit()
            }
        }
        .frame(width: size, height: size)
        .overlay(alignment: .bottom) {
            if highlighted {
                Capsule().fill(AvatarCatalog.color(avatarId)).frame(width: size * 0.3, height: 3)
            }
        }
        .accessibilityLabel(name == "cat" ? "Chef cat agent" : "\(name == "bokchoy" ? "Bok choy" : name.capitalized) agent")
        .accessibilityValue(state == .thinking ? "Thinking" : state == .happy ? "Happy" : state == .confused ? "Needs attention" : "")
    }
}

private struct AgentDrawing: UIViewRepresentable {
    let name: String
    let state: AgentAvatarState
    let reduceMotion, active: Bool
    let onAnimationComplete: (() -> Void)?
    func makeUIView(context: Context) -> AgentDrawingView { AgentDrawingView() }
    func updateUIView(_ view: AgentDrawingView, context: Context) {
        view.configure(name: name, state: state, reduced: reduceMotion, active: active,
                       onAnimationComplete: onAnimationComplete)
    }
    static func dismantleUIView(_ view: AgentDrawingView, coordinator: ()) { AgentAnimationLoop.shared.remove(view) }
}

/// Parses only the absolute M/C/Z commands used by the supplied artwork, once per asset.
private enum AgentPaths {
    struct Layer: Decodable { let fill, d: String }
    struct Eye: Decodable { let cx, cy: Double; let d: String }
    struct Character: Decodable { let layers: [Layer]; let eyes: [Eye] }
    struct Drawing {
        let layers: [(CGPath, CGColor)]
        let eyes: [(CGPath, CGPoint)]
    }
    static let drawings: [String: Drawing] = {
        guard let data = NSDataAsset(name: "AgentCharacters")?.data,
              let characters = try? JSONDecoder().decode([String: Character].self, from: data) else {
            assertionFailure("Missing AgentCharacters asset"); return [:]
        }
        return characters.mapValues { c in
            Drawing(layers: c.layers.map { (path($0.d), color($0.fill)) },
                    eyes: c.eyes.map { (path($0.d), CGPoint(x: $0.cx, y: $0.cy)) })
        }
    }()
    static func color(_ hex: String) -> CGColor {
        let n = UInt32(hex.dropFirst(), radix: 16) ?? 0
        return UIColor(red: CGFloat((n >> 16) & 255) / 255, green: CGFloat((n >> 8) & 255) / 255,
                       blue: CGFloat(n & 255) / 255, alpha: 1).cgColor
    }
    static func path(_ source: String) -> CGPath {
        let scanner = Scanner(string: source)
        let path = CGMutablePath()
        func point() -> CGPoint {
            guard let x = scanner.scanDouble(), let y = scanner.scanDouble() else {
                preconditionFailure("Invalid character path")
            }
            return CGPoint(x: x, y: y)
        }
        while !scanner.isAtEnd {
            if scanner.scanString("M") != nil { path.move(to: point()) }
            else if scanner.scanString("C") != nil {
                let a = point(), b = point(), end = point()
                path.addCurve(to: end, control1: a, control2: b)
            } else if scanner.scanString("Z") != nil { path.closeSubpath() }
            else { preconditionFailure("Unsupported character path command") }
        }
        return path
    }
}

/// One clock for all mounted avatars. Weak membership prevents retaining removed screens.
private final class AgentAnimationLoop: NSObject {
    static let shared = AgentAnimationLoop()
    private let views = NSHashTable<AgentDrawingView>.weakObjects()
    private var link: CADisplayLink?
    private var last: Double = 0
    private var pointer: CGPoint?
    private var pointerTime: Double = 0
    private weak var pointerWindow: UIWindow?
    private var hover: UIHoverGestureRecognizer?

    func add(_ view: AgentDrawingView) {
        views.add(view)
        if link == nil {
            last = CACurrentMediaTime()
            let display = CADisplayLink(target: self, selector: #selector(tick))
            display.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 30, preferred: 30)
            display.add(to: .main, forMode: .common)
            link = display
        }
        if let window = view.window, pointerWindow !== window {
            if let hover { pointerWindow?.removeGestureRecognizer(hover) }
            let gesture = UIHoverGestureRecognizer(target: self, action: #selector(hovered(_:)))
            gesture.cancelsTouchesInView = false
            window.addGestureRecognizer(gesture)
            hover = gesture; pointerWindow = window
        }
    }
    func remove(_ view: AgentDrawingView) {
        views.remove(view)
        if views.allObjects.isEmpty {
            link?.invalidate(); link = nil
            if let hover { pointerWindow?.removeGestureRecognizer(hover) }
            hover = nil; pointerWindow = nil; pointer = nil
        }
    }
    @objc private func hovered(_ gesture: UIHoverGestureRecognizer) {
        pointer = gesture.state == .ended || gesture.state == .cancelled ? nil : gesture.location(in: pointerWindow)
        pointerTime = CACurrentMediaTime()
    }
    @objc private func tick() {
        let now = CACurrentMediaTime(), dt = min(0.05, now - last)
        last = now
        guard UIApplication.shared.applicationState == .active else { return }
        for view in views.allObjects where view.active && view.isVisible {
            let local = now - pointerTime < 4 && view.window === pointerWindow ? pointer.map { view.convert($0, from: pointerWindow) } : nil
            view.advance(dt: dt, pointer: local)
        }
    }
}

final class AgentDrawingView: UIView {
    private var name = ""
    private var state: AgentAvatarState = .idle
    private var reduced = false
    var active = true
    private var p = AgentPersonality.all["tomato"]!
    private var t = Double.random(in: 0...6)
    private var elapsed = 0.0
    private var ex = 0.0, ey = 0.0, gx = 0.0, gy = 0.0
    private var hy = 0.0, hv = 0.0, wind = 0.0, squash = 0.0, velocity = 0.0
    private var air = false, secondBlink = false
    private var blink = -1.0, nextBlink = 1.0, nextHop = 3.0, nextGlance = 1.0
    private var eyeScale = 1.0
    private var launchCompleted = false
    private var onAnimationComplete: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false; backgroundColor = .clear; isUserInteractionEnabled = false
        contentMode = .redraw
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { AgentAnimationLoop.shared.remove(self) }
        else { AgentAnimationLoop.shared.add(self) }
    }
    var isVisible: Bool {
        guard let window, bounds.width > 0 else { return false }
        var rect = convert(bounds, to: window)
        var ancestor: UIView? = self
        while let view = ancestor {
            if view.isHidden || view.alpha < 0.01 { return false }
            if view.clipsToBounds { rect = rect.intersection(view.convert(view.bounds, to: window)) }
            ancestor = view.superview
        }
        return !rect.isEmpty && rect.intersects(window.bounds)
    }
    func configure(name: String, state: AgentAvatarState, reduced: Bool, active: Bool,
                   onAnimationComplete: (() -> Void)? = nil) {
        self.onAnimationComplete = onAnimationComplete
        if self.name != name {
            self.name = name; p = AgentPersonality.all[name]!
            elapsed = 0; nextBlink = .random(in: 0.5...2); nextGlance = .random(in: 0.5...2)
            nextHop = .random(in: p.hi); hy = 0; hv = 0; wind = 0; air = false
            squash = 0; velocity = 0; ex = 0; ey = 0; blink = -1; eyeScale = 1
        }
        self.reduced = reduced; self.active = active
        if reduced { hy = 0; hv = 0; wind = 0; air = false; squash = 0; velocity = 0 }
        if state != self.state {
            if state == .launching {
                elapsed = 0; launchCompleted = false; ex = 0; ey = 0
                hy = 0; hv = 0; wind = 0; air = false; squash = 0; velocity = 0
            }
            if state == .happy && !reduced { wind = 0.13 }
            if state == .thinking { nextBlink = elapsed + .random(in: p.bk) * 1.5 }
            self.state = state
        }
        setNeedsDisplay()
    }
    func advance(dt: Double, pointer: CGPoint?) {
        if state == .launching && launchCompleted { return }
        elapsed += dt; t += dt
        if state == .launching {
            eyeScale = 1
            for start in [0.35, 0.70] {
                let progress = (elapsed - start) / 0.18
                if (0...1).contains(progress) { eyeScale = 1 - 0.92 * sin(.pi * progress) }
            }
            if elapsed >= 1.2 && !launchCompleted {
                launchCompleted = true
                onAnimationComplete?()
            }
            setNeedsDisplay()
            return
        }
        if elapsed > nextBlink && blink < 0 { blink = 0 }
        eyeScale = 1
        if blink >= 0 {
            blink += dt / (state == .thinking ? 0.24 : 0.17)
            if blink >= 1 {
                blink = -1
                if !secondBlink && Double.random(in: 0...1) < p.db {
                    secondBlink = true; nextBlink = elapsed + 0.22
                } else {
                    secondBlink = false
                    nextBlink = elapsed + .random(in: p.bk) * (state == .thinking ? 1.5 : 1)
                }
            } else { eyeScale = 1 - 0.92 * sin(.pi * blink) }
        }
        if !reduced {
            if elapsed > nextHop && !air && wind <= 0 {
                if state == .idle { wind = 0.13 }
                nextHop = elapsed + .random(in: p.hi)
            }
            if wind > 0 {
                wind -= dt
                if wind <= 0 { air = true; hv = sqrt(2 * 2600 * p.hh) }
            }
            if air {
                hv -= 2600 * dt; hy += hv * dt
                if hy <= 0 { hy = 0; air = false; velocity += abs(hv) / 2600 * 1.2 * p.sq * 20; hv = 0 }
            }
            let target = wind > 0 ? p.sq * 1.1 : air ? -abs(hv) / 12000 : 0
            velocity += ((target - squash) * 320 - velocity * 13) * dt
            squash += velocity * dt
        }
        var tx = gx, ty = gy, following = false
        if let pointer {
            let dx = pointer.x - bounds.midX, dy = pointer.y - bounds.midY
            let distance = hypot(dx, dy)
            if distance < 260 {
                tx = dx / 260; ty = dy / 260; following = true
            }
        }
        if !following {
            if elapsed > nextGlance {
                gx = Double.random(in: 0...1) < 0.3 ? 0 : .random(in: -1...1)
                gy = state == .thinking ? -.random(in: 0.3...0.7) : .random(in: -0.7...0.7)
                nextGlance = elapsed + .random(in: p.gl)
            }
            tx = gx; ty = gy
        }
        let smoothing = 1 - exp(-dt * (following ? 14 : 9))
        ex += (tx - ex) * smoothing; ey += (ty - ey) * smoothing
        setNeedsDisplay()
    }
    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext(), let drawing = AgentPaths.drawings[name] else { return }
        ctx.saveGState()
        ctx.scaleBy(x: bounds.width / 1024, y: bounds.height / 1024)
        let still = reduced || state == .launching
        let breath = still ? 0 : p.br * sin(t * p.bs)
        let rotation = still ? 0 : p.sw * sin(t * p.bs * 0.6) + p.ln * ex + (state == .confused ? 9 : 0)
        ctx.translateBy(x: 512, y: 860 - hy)
        ctx.rotate(by: rotation * .pi / 180)
        ctx.scaleBy(x: 1 + squash * 0.6 - breath * 0.5, y: 1 - squash + breath)
        ctx.translateBy(x: -512, y: -860)
        for (index, layer) in drawing.layers.enumerated() {
            ctx.saveGState()
            if index == 0 {
                // Native equivalent of the SVG white mask with black eye paths:
                // even-odd clipping removes the eyes, revealing ANY background.
                let mask = CGMutablePath()
                mask.addRect(CGRect(x: -200, y: -200, width: 1424, height: 1424))
                for (eye, center) in drawing.eyes {
                    let transform = CGAffineTransform(translationX: ex * p.er, y: ey * p.er * 0.8)
                        .translatedBy(x: center.x, y: center.y)
                        .scaledBy(x: 1 + (1 - eyeScale) * 0.18, y: eyeScale)
                        .translatedBy(x: -center.x, y: -center.y)
                    mask.addPath(eye, transform: transform)
                }
                ctx.addPath(mask); ctx.clip(using: .evenOdd)
            }
            ctx.addPath(layer.0); ctx.setFillColor(layer.1); ctx.drawPath(using: .eoFill)
            ctx.restoreGState()
        }
        ctx.restoreGState()
    }
}
