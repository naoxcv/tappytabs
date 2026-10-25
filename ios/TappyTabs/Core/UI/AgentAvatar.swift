import SwiftUI
import UIKit

enum AgentAvatarState { case idle, thinking, happy, confused, launching, celebrating }

/// Existing call sites retain their API. Small avatars use the supplied transparent PNGs.
struct AvatarView: View {
    let avatarId: String
    var size: CGFloat = 56
    var highlighted = false
    var state: AgentAvatarState = .idle
    var animated = true
    var interactive = false
    var onAnimationComplete: (() -> Void)? = nil
    @State private var spinRequest = 0
    @State private var bounceRequest = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let name = AvatarCatalog.character(avatarId)
        Group {
            if animated && size >= 48 {
                AgentDrawing(name: name, state: state, reduceMotion: reduceMotion, active: scenePhase == .active,
                             interactive: interactive, spinRequest: spinRequest, bounceRequest: bounceRequest,
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
        .accessibilityHint(interactive ? "Drag to move, tap to spin, or touch and hold to bounce." : "")
        .accessibilityActions {
            if interactive {
                Button("Spin") { spinRequest &+= 1 }
                Button("Bounce") { bounceRequest &+= 1 }
            }
        }
    }
}

private struct AgentDrawing: UIViewRepresentable {
    let name: String
    let state: AgentAvatarState
    let reduceMotion, active: Bool
    let interactive: Bool
    let spinRequest, bounceRequest: Int
    let onAnimationComplete: (() -> Void)?
    func makeUIView(context: Context) -> AgentDrawingView { AgentDrawingView() }
    func updateUIView(_ view: AgentDrawingView, context: Context) {
        view.configure(name: name, state: state, reduced: reduceMotion, active: active,
                       interactive: interactive, spinRequest: spinRequest, bounceRequest: bounceRequest,
                       onAnimationComplete: onAnimationComplete)
    }
    static func dismantleUIView(_ view: AgentDrawingView, coordinator: ()) { AgentAnimationLoop.shared.remove(view) }
}

struct AgentPlayground: UIViewRepresentable {
    let avatarId: String
    let initialPosition: CGPoint
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    func makeUIView(context: Context) -> AgentDrawingView { AgentDrawingView() }

    func updateUIView(_ view: AgentDrawingView, context: Context) {
        view.configure(name: AvatarCatalog.character(avatarId), state: .idle,
                       reduced: reduceMotion, active: scenePhase == .active, interactive: true,
                       roaming: true, initialPosition: initialPosition)
    }
}

struct AgentFlingMotion {
    private(set) var position = CGPoint.zero
    private(set) var velocity = CGVector.zero
    private(set) var home = CGPoint.zero
    private var area = CGRect.zero
    private var initialized = false
    private var shouldReturn = false
    private var settleTime = 0.0, returnElapsed = 0.0
    private var returnStart: CGPoint?
    fileprivate private(set) var rotation = 0.0
    private var spinVelocity = 0.0
    private var returnRotationStart = 0.0

    var isReturning: Bool { returnStart != nil }

    mutating func updateBounds(size: CGSize, radius: CGFloat, start: CGPoint) {
        guard size.width > 0, size.height > 0 else { return }
        let inset = CGSize(width: min(radius, size.width / 2), height: min(radius, size.height / 2))
        area = CGRect(x: inset.width, y: inset.height,
                      width: max(0, size.width - inset.width * 2), height: max(0, size.height - inset.height * 2))
        home = clamped(start)
        if !initialized { position = home; initialized = true }
        move(to: position)
    }

    mutating func move(to point: CGPoint) {
        position = clamped(point)
    }

    private func clamped(_ point: CGPoint) -> CGPoint {
        CGPoint(x: max(area.minX, min(area.maxX, point.x)),
                y: max(area.minY, min(area.maxY, point.y)))
    }

    mutating func fling(_ proposed: CGVector, reducedMotion: Bool) {
        guard !reducedMotion else { stop(); return }
        let speed = hypot(proposed.dx, proposed.dy)
        let scale = speed > 1600 ? 1600 / speed : 1
        velocity = CGVector(dx: proposed.dx * scale, dy: proposed.dy * scale)
        spinVelocity = min(2.2, max(0.8, speed / 700)) * (proposed.dx < 0 ? -1 : 1)
        shouldReturn = true
        settleTime = 0
        returnStart = nil
    }

    mutating func stop() {
        velocity = .zero
        spinVelocity = 0
        shouldReturn = false
        returnStart = nil
        settleTime = 0
    }

    mutating func advance(dt: Double) {
        guard initialized else { return }
        let elapsed = max(0, min(0.05, dt))
        if let start = returnStart {
            returnElapsed += elapsed
            let distance = hypot(home.x - start.x, home.y - start.y)
            let hops = min(5, max(2, ceil(distance / 120) + 1))
            let progress = min(1, returnElapsed / (hops * 0.42))
            let upright = round(returnRotationStart / (2 * .pi)) * (2 * .pi)
            let straighten = min(1, returnElapsed / 0.42)
            let easedStraighten = straighten * straighten * (3 - 2 * straighten)
            rotation = returnRotationStart + (upright - returnRotationStart) * easedStraighten
            let travel = progress * progress * (3 - 2 * progress)
            let phase = progress * hops - floor(progress * hops)
            let lift = sin(.pi * phase) * min(22, distance * 0.12) * (1 - progress * 0.35)
            move(to: CGPoint(x: start.x + (home.x - start.x) * travel,
                             y: start.y + (home.y - start.y) * travel - lift))
            if progress >= 1 { position = home; stop() }
            return
        }
        let friction = exp(-elapsed * 1.15)
        velocity.dx *= friction; velocity.dy *= friction
        spinVelocity *= exp(-elapsed * 1.5)
        rotation += spinVelocity * elapsed
        position.x += velocity.dx * elapsed; position.y += velocity.dy * elapsed
        if position.x < area.minX {
            position.x = min(area.maxX, area.minX + area.minX - position.x)
            velocity.dx = abs(velocity.dx) * 0.82
        } else if position.x > area.maxX {
            position.x = max(area.minX, area.maxX - (position.x - area.maxX))
            velocity.dx = -abs(velocity.dx) * 0.82
        }
        if position.y < area.minY {
            position.y = min(area.maxY, area.minY + area.minY - position.y)
            velocity.dy = abs(velocity.dy) * 0.82
        } else if position.y > area.maxY {
            position.y = max(area.minY, area.maxY - (position.y - area.maxY))
            velocity.dy = -abs(velocity.dy) * 0.82
        }
        if hypot(velocity.dx, velocity.dy) < 8 {
            velocity = .zero
            if shouldReturn {
                settleTime += elapsed
                if hypot(position.x - home.x, position.y - home.y) <= 1 {
                    position = home
                    stop()
                } else if settleTime >= 0.3 {
                    returnStart = position
                    returnElapsed = 0
                    returnRotationStart = rotation
                }
            }
        }
    }
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
    private var spinTime = -1.0, nextSpin = 0.0, spinDirection = 1.0
    private var interactive = false, dragging = false
    private var dragOffset = CGPoint.zero, dragOrigin = CGPoint.zero
    private var wanderOffset = CGPoint.zero
    private var dragVelocity = CGVector.zero
    private var lastSpinRequest = 0, lastBounceRequest = 0
    private var roaming = false
    private var initialPosition = CGPoint.zero
    private var flingMotion = AgentFlingMotion()
    private let playgroundCharacterSize: CGFloat = 360
    private let playgroundRadius: CGFloat = 120

    private var spinDuration: Double { max(0.8, min(1.3, 1.8 / p.bs)) }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false; backgroundColor = .clear; isUserInteractionEnabled = false
        contentMode = .redraw
        let pan = UIPanGestureRecognizer(target: self, action: #selector(dragged(_:)))
        pan.maximumNumberOfTouches = 1
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        let hold = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
        hold.minimumPressDuration = 0.4
        tap.require(toFail: pan)
        tap.require(toFail: hold)
        addGestureRecognizer(pan)
        addGestureRecognizer(tap)
        addGestureRecognizer(hold)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layoutSubviews() {
        super.layoutSubviews()
        if roaming {
            flingMotion.updateBounds(size: bounds.size, radius: playgroundRadius, start: initialPosition)
        }
    }
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        guard roaming else { return super.point(inside: point, with: event) }
        return CGRect(x: flingMotion.position.x - 135, y: flingMotion.position.y - 135,
                      width: 270, height: 270).contains(point) && bounds.contains(point)
    }
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
                   interactive: Bool = false, spinRequest: Int = 0, bounceRequest: Int = 0,
                   roaming: Bool = false, initialPosition: CGPoint = .zero,
                   onAnimationComplete: (() -> Void)? = nil) {
        self.onAnimationComplete = onAnimationComplete
        self.interactive = interactive
        isUserInteractionEnabled = interactive
        self.roaming = roaming
        self.initialPosition = initialPosition
        isAccessibilityElement = roaming
        if roaming {
            flingMotion.updateBounds(size: bounds.size, radius: playgroundRadius, start: initialPosition)
            accessibilityLabel = "Your \(name == "bokchoy" ? "bok choy" : name) agent"
            accessibilityHint = "Drag anywhere in the page. Release quickly to throw. Tap to spin or hold to bounce."
            accessibilityCustomActions = [
                UIAccessibilityCustomAction(name: "Spin", target: self, selector: #selector(accessibilitySpin)),
                UIAccessibilityCustomAction(name: "Bounce", target: self, selector: #selector(accessibilityBounce)),
                UIAccessibilityCustomAction(name: "Throw", target: self, selector: #selector(accessibilityThrow))
            ]
        } else { accessibilityCustomActions = nil }
        if !interactive { dragging = false; dragOffset = .zero; dragVelocity = .zero }
        if self.name != name {
            self.name = name; p = AgentPersonality.all[name]!
            elapsed = 0; nextBlink = .random(in: 0.5...2); nextGlance = .random(in: 0.5...2)
            nextHop = .random(in: p.hi); hy = 0; hv = 0; wind = 0; air = false
            squash = 0; velocity = 0; ex = 0; ey = 0; blink = -1; eyeScale = 1
            spinTime = -1
        }
        self.reduced = reduced; self.active = active
        if reduced {
            flingMotion.stop()
            hy = 0; hv = 0; wind = 0; air = false; squash = 0; velocity = 0; spinTime = -1
            wanderOffset = .zero
            if !dragging { dragOffset = .zero; dragVelocity = .zero }
        }
        if state != self.state {
            if state == .launching {
                elapsed = 0; launchCompleted = false; ex = 0; ey = 0
                hy = 0; hv = 0; wind = 0; air = false; squash = 0; velocity = 0
            }
            if state == .celebrating {
                spinTime = -1
                nextSpin = elapsed + .random(in: 1.5...4)
                nextHop = elapsed + .random(in: p.hi) * 0.45
            }
            if (state == .happy || state == .celebrating) && !reduced { wind = 0.13 }
            if state == .thinking { nextBlink = elapsed + .random(in: p.bk) * 1.5 }
            self.state = state
        }
        if spinRequest != lastSpinRequest {
            lastSpinRequest = spinRequest
            if interactive { spin() }
        }
        if bounceRequest != lastBounceRequest {
            lastBounceRequest = bounceRequest
            if interactive { bounce() }
        }
        setNeedsDisplay()
    }

    func spin() {
        blink = 0
        guard !reduced, spinTime < 0, !dragging else { return }
        spinTime = 0
        spinDirection = Bool.random() ? 1 : -1
        nextSpin = elapsed + .random(in: 4...8)
    }

    func bounce() {
        blink = 0
        guard !reduced, !air, wind <= 0, !dragging else { return }
        wind = 0.13
    }

    @objc private func tapped() {
        spin()
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @objc private func accessibilitySpin() -> Bool { spin(); return true }
    @objc private func accessibilityBounce() -> Bool { bounce(); return true }
    @objc private func accessibilityThrow() -> Bool {
        flingMotion.fling(CGVector(dx: 800, dy: -500), reducedMotion: reduced)
        return true
    }

    @objc private func held(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began else { return }
        bounce()
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }

    @objc private func dragged(_ gesture: UIPanGestureRecognizer) {
        switch gesture.state {
        case .began:
            dragging = true
            dragOrigin = roaming ? flingMotion.position : dragOffset
            flingMotion.stop()
            dragVelocity = .zero
            hy = 0; hv = 0; wind = 0; air = false; squash = 0; velocity = 0
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case .changed:
            let translation = gesture.translation(in: self)
            if roaming {
                flingMotion.move(to: CGPoint(x: dragOrigin.x + translation.x, y: dragOrigin.y + translation.y))
            } else {
                dragOffset.x = max(-180, min(180, dragOrigin.x + translation.x * 1024 / max(1, bounds.width)))
                dragOffset.y = max(-180, min(180, dragOrigin.y + translation.y * 1024 / max(1, bounds.height)))
            }
        case .ended, .cancelled, .failed:
            dragging = false
            if roaming && gesture.state == .ended {
                let release = gesture.velocity(in: self)
                flingMotion.fling(CGVector(dx: release.x, dy: release.y), reducedMotion: reduced)
            }
            if reduced { dragOffset = .zero }
        default: break
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
        if roaming && !dragging && !reduced { flingMotion.advance(dt: dt) }
        if interactive && !roaming && !dragging && !reduced {
            dragVelocity.dx += (-dragOffset.x * 180 - dragVelocity.dx * 18) * dt
            dragVelocity.dy += (-dragOffset.y * 180 - dragVelocity.dy * 18) * dt
            dragOffset.x += dragVelocity.dx * dt
            dragOffset.y += dragVelocity.dy * dt
        }
        if !reduced && !dragging {
            if state == .celebrating {
                let smoothing = 1 - exp(-dt * 6)
                wanderOffset.x += (sin(t * p.bs * 0.55) * 90 - wanderOffset.x) * smoothing
                wanderOffset.y += (sin(t * p.bs * 0.7) * 28 - wanderOffset.y) * smoothing
            }
            if state == .celebrating {
                if spinTime < 0 && elapsed >= nextSpin {
                    spinTime = 0
                    spinDirection = Bool.random() ? 1 : -1
                    nextSpin = elapsed + .random(in: 4...8)
                }
            }
            if spinTime >= 0 {
                spinTime += dt
                if spinTime >= spinDuration { spinTime = -1 }
            }
            if elapsed > nextHop && !air && wind <= 0 {
                if state == .idle || state == .celebrating { wind = 0.13 }
                nextHop = elapsed + .random(in: p.hi) * (state == .celebrating ? 0.45 : 1)
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
            let center = roaming ? flingMotion.position : CGPoint(x: bounds.midX, y: bounds.midY)
            let dx = pointer.x - center.x, dy = pointer.y - center.y
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
        if roaming {
            ctx.translateBy(x: flingMotion.position.x - playgroundCharacterSize / 2,
                            y: flingMotion.position.y - playgroundCharacterSize / 2)
            ctx.scaleBy(x: playgroundCharacterSize / 1024, y: playgroundCharacterSize / 1024)
        } else {
            ctx.scaleBy(x: bounds.width / 1024, y: bounds.height / 1024)
        }
        if state == .celebrating || interactive || spinTime >= 0 {
            let progress = spinTime < 0 || reduced ? 0 : min(1, spinTime / spinDuration)
            let turn = progress * progress * (3 - 2 * progress) * 2 * Double.pi * spinDirection
            let wandering = state == .celebrating && !reduced
            ctx.translateBy(x: 512 + dragOffset.x + (wandering ? wanderOffset.x : 0),
                            y: 512 + dragOffset.y + (wandering ? wanderOffset.y : 0))
            ctx.rotate(by: turn + (roaming ? flingMotion.rotation : 0))
            ctx.scaleBy(x: 0.76, y: 0.76)
            ctx.translateBy(x: -512, y: -512)
        }
        let still = reduced || state == .launching
        let breath = still ? 0 : p.br * sin(t * p.bs)
        let sway = p.sw * (state == .celebrating ? 3 : 1)
        // Keep the large roaming avatar upright while idle so it doesn't appear
        // horizontally offset compared with its upright return position.
        let idleRotation = roaming ? 0 : sway * sin(t * p.bs * 0.6) + p.ln * ex
        let rotation = still ? 0 : idleRotation + (state == .confused ? 9 : 0)
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
