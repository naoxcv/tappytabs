// Owner: Role 1 (fixtures, store) + Role 2 (tap detector, join links).
import XCTest
import UIKit
import SwiftUI
@testable import TappyTabs

final class AppTypographyTests: XCTestCase {
    @MainActor
    func testFontFamiliesAreRegisteredForHeadingsAndBodyText() throws {
        for style in [Font.TextStyle.largeTitle, .title, .title2, .title3, .headline, .body, .callout, .subheadline, .footnote, .caption, .caption2] {
            for weight in [Font.Weight.regular, .medium, .semibold, .bold, .black] {
                let name = AppTypography.postScriptName(for: weight, style: style)
                let font = try XCTUnwrap(UIFont(name: name, size: 17), "Missing bundled font: \(name)")
                let heading = [Font.TextStyle.largeTitle, .title, .title2, .title3, .headline].contains(style)
                XCTAssertTrue(font.familyName.hasPrefix(heading ? "Raleway" : "Open Sans"), name)
            }
        }
    }
}

final class TapDetectorTests: XCTestCase {
    func testFiresAfterConsecutiveCloseReadings() {
        var d = TapDetector()
        XCTAssertFalse(d.feed(0.10))
        XCTAssertFalse(d.feed(0.10))
        XCTAssertTrue(d.feed(0.10))
    }

    func testFarOrNilResets() {
        var d = TapDetector()
        _ = d.feed(0.1); _ = d.feed(0.1)
        XCTAssertFalse(d.feed(0.5))
        _ = d.feed(0.1); _ = d.feed(0.1)
        XCTAssertFalse(d.feed(nil))
        XCTAssertEqual(d.count, 0)
    }

    func testDebounce() {
        var d = TapDetector()
        let t0 = Date()
        for _ in 0..<2 { _ = d.feed(0.1, now: t0) }
        XCTAssertTrue(d.feed(0.1, now: t0))
        for _ in 0..<3 { XCTAssertFalse(d.feed(0.1, now: t0.addingTimeInterval(1))) }
        for _ in 0..<2 { _ = d.feed(0.1, now: t0.addingTimeInterval(6)) }
        XCTAssertTrue(d.feed(0.1, now: t0.addingTimeInterval(6)))
    }
}

final class JoinLinkTests: XCTestCase {
    func testRoundTrip() {
        XCTAssertEqual(JoinLink.joinCode(from: JoinLink.url(joinCode: "ABC234")), "ABC234")
        XCTAssertEqual(JoinLink.joinCode(from: URL(string: "tappytabs://join/abc234")!), "ABC234")
        XCTAssertNil(JoinLink.joinCode(from: URL(string: "https://example.com/join/X")!))
    }
}

/// The fixtures are exported from the real backend; if these fail, Models.swift and the API disagree.
final class FixtureDecodingTests: XCTestCase {
    func testAllFixturesDecode() {
        let _: Party = Fixtures.load("party_pick")
        let _: Party = Fixtures.load("party_confirm")
        let _: Party = Fixtures.load("party_placed")
        let _: MessagesPayload = Fixtures.load("messages")
        let c: [Candidate] = Fixtures.load("candidates")
        XCTAssertTrue(c.contains { $0.isDrink })
        let _: LinesPayload = Fixtures.load("lines_confirm")
        let _: [AddableItem] = Fixtures.load("addable_shared")
        let r: RemoveResult = Fixtures.load("remove_result")
        XCTAssertNotNil(r.substitute)
        let _: MenuStatus = Fixtures.load("menu_status")
        let _: [RestaurantRef] = Fixtures.load("restaurants")
        let _: [OnboardingCard] = Fixtures.load("OnboardingCards")
    }

    func testTotalsSumExactly() {
        let l: LinesPayload = Fixtures.load("lines_confirm")
        XCTAssertEqual(l.totals.perUser.values.reduce(0, +), l.totals.total)
    }
}

final class PartyStoreTests: XCTestCase {
    func testMockPartyReachesPickAndShowsCandidates() {
        let mock = MockBackend(stepDelay: 0)
        let store = PartyStore(partyId: mock.ids.partyId, userId: mock.ids.userIds[0], deviceId: "demo-diner-1", backend: mock)
        store.start()
        mock.jump(to: .pick)
        let exp = expectation(description: "pick")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            XCTAssertEqual(store.party?.status, .pick)
            XCTAssertEqual(store.mains.count, 3)
            XCTAssertEqual(store.mains.first?.rank, 1)
            XCTAssertFalse(store.visibleBubbles(at: Date()).isEmpty)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2)
    }
}


final class AgentFlingMotionTests: XCTestCase {
    func testFlingSettlesThenHopsBackToItsStartingPosition() {
        var motion = AgentFlingMotion()
        let start = CGPoint(x: 160, y: 140)
        motion.updateBounds(size: CGSize(width: 320, height: 480), radius: 40, start: start)
        motion.move(to: CGPoint(x: 250, y: 350))
        motion.fling(CGVector(dx: 500, dy: 500), reducedMotion: false)
        var sawReturn = false
        for _ in 0..<600 {
            motion.advance(dt: 1.0 / 60)
            sawReturn = sawReturn || motion.isReturning
            XCTAssertTrue((40...280).contains(motion.position.x))
            XCTAssertTrue((40...440).contains(motion.position.y))
        }
        XCTAssertTrue(sawReturn)
        XCTAssertEqual(motion.position, start)
        XCTAssertFalse(motion.isReturning)
    }

    func testCatchingTheAgentInterruptsItsReturn() {
        var motion = AgentFlingMotion()
        let start = CGPoint(x: 160, y: 140)
        motion.updateBounds(size: CGSize(width: 320, height: 480), radius: 40, start: start)
        motion.move(to: CGPoint(x: 250, y: 350))
        motion.fling(.zero, reducedMotion: false)
        for _ in 0..<30 { motion.advance(dt: 1.0 / 60) }
        XCTAssertTrue(motion.isReturning)
        motion.stop()
        let caught = motion.position
        for _ in 0..<120 { motion.advance(dt: 1.0 / 60) }
        XCTAssertEqual(motion.position, caught)
        motion.fling(.zero, reducedMotion: false)
        for _ in 0..<180 { motion.advance(dt: 1.0 / 60) }
        XCTAssertEqual(motion.position, start)
    }

    func testFlingReflectsAtWallsAndComesToRest() {
        var motion = AgentFlingMotion()
        motion.updateBounds(size: CGSize(width: 320, height: 480), radius: 40, start: CGPoint(x: 265, y: 420))
        motion.fling(CGVector(dx: 1200, dy: 900), reducedMotion: false)
        motion.advance(dt: 0.04)
        XCTAssertLessThan(motion.velocity.dx, 0)
        XCTAssertLessThan(motion.velocity.dy, 0)
        for _ in 0..<600 {
            motion.advance(dt: 1.0 / 60)
            XCTAssertTrue((40...280).contains(motion.position.x))
            XCTAssertTrue((40...440).contains(motion.position.y))
        }
        XCTAssertEqual(motion.velocity.dx, 0)
        XCTAssertEqual(motion.velocity.dy, 0)
    }

    func testReducedMotionKeepsDraggedPositionWithoutMomentum() {
        var motion = AgentFlingMotion()
        motion.updateBounds(size: CGSize(width: 320, height: 480), radius: 40, start: CGPoint(x: 160, y: 150))
        motion.move(to: CGPoint(x: 220, y: 300))
        motion.fling(CGVector(dx: 900, dy: -700), reducedMotion: true)
        motion.advance(dt: 0.05)
        XCTAssertEqual(motion.position, CGPoint(x: 220, y: 300))
    }

    func testLargeThrowsAndResizingNeverEscapeThePlayArea() {
        var motion = AgentFlingMotion()
        motion.updateBounds(size: CGSize(width: 320, height: 480), radius: 60, start: CGPoint(x: 160, y: 240))
        motion.fling(CGVector(dx: 100_000, dy: -100_000), reducedMotion: false)
        XCTAssertEqual(hypot(motion.velocity.dx, motion.velocity.dy), 1600, accuracy: 0.001)
        motion.updateBounds(size: CGSize(width: 140, height: 130), radius: 60, start: .zero)
        for _ in 0..<240 {
            motion.advance(dt: 1.0 / 30)
            XCTAssertTrue((60...80).contains(motion.position.x))
            XCTAssertTrue((60...70).contains(motion.position.y))
        }
    }

    @MainActor
    func testPlaygroundPassesTouchesOutsideTheCharacter() {
        let view = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
        view.configure(name: "tomato", state: .idle, reduced: false, active: true, interactive: true,
                       roaming: true, initialPosition: CGPoint(x: 160, y: 150))
        XCTAssertTrue(view.point(inside: CGPoint(x: 160, y: 150), with: nil))
        XCTAssertFalse(view.point(inside: CGPoint(x: 10, y: 460), with: nil))
    }
}

final class AgentAvatarTests: XCTestCase {
    @MainActor
    func testLaunchAnimationCompletesOnceAndCanReplay() {
        let view = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 180, height: 180))
        var completions = 0
        view.configure(name: "cat", state: .launching, reduced: false, active: true,
                       onAnimationComplete: { completions += 1 })
        for _ in 0..<30 { view.advance(dt: 1.0 / 30, pointer: nil) }
        XCTAssertEqual(completions, 0)
        for _ in 0..<30 { view.advance(dt: 1.0 / 30, pointer: nil) }
        XCTAssertEqual(completions, 1)
        view.configure(name: "cat", state: .idle, reduced: true, active: true)
        view.configure(name: "cat", state: .launching, reduced: true, active: true,
                       onAnimationComplete: { completions += 1 })
        for _ in 0..<45 { view.advance(dt: 1.0 / 30, pointer: nil) }
        XCTAssertEqual(completions, 2)
    }

    func testLegacyIDsKeepTheirCharactersWhenReordered() {
        let expected = ["tomato", "mushroom", "bokchoy", "garlic", "tomato", "mushroom", "bokchoy", "garlic"]
        for n in (1...8).reversed() {
            XCTAssertEqual(AvatarCatalog.character("avatar_\(n)"), expected[n - 1])
        }
        XCTAssertEqual(AvatarCatalog.character("restaurant"), "cat")
        XCTAssertEqual(AvatarCatalog.character("tomato"), "tomato")
        XCTAssertTrue(AvatarCatalog.characters.contains(AvatarCatalog.character("unknown-agent")))
    }

    @MainActor
    func testHappyAndCelebratingHopsRespectReducedMotion() throws {
        func topEdge(_ view: AgentDrawingView) throws -> Int {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1; format.opaque = false
            let image = UIGraphicsImageRenderer(size: view.bounds.size, format: format).image { _ in view.draw(view.bounds) }
            let cg = try XCTUnwrap(image.cgImage)
            var pixels = [UInt8](repeating: 0, count: 1024 * 1024 * 4)
            try pixels.withUnsafeMutableBytes { buffer in
                let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1024, height: 1024, bitsPerComponent: 8,
                    bytesPerRow: 4096, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
                context.draw(cg, in: view.bounds)
            }
            let first = try XCTUnwrap(stride(from: 3, to: pixels.count, by: 4).first { pixels[$0] > 128 })
            return first / 4096
        }
        for state in [AgentAvatarState.happy, .celebrating] {
            for reduced in [false, true] {
                let view = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 1024, height: 1024))
                view.configure(name: "tomato", state: state, reduced: reduced, active: true, interactive: true)
                if reduced { view.spin(); view.bounce() }
                let before = try topEdge(view)
                for _ in 0..<9 { view.advance(dt: 1.0 / 30, pointer: nil) }
                let after = try topEdge(view)
                if reduced { XCTAssertEqual(after, before, "Reduce Motion must suppress the hop and sway") }
                else { XCTAssertLessThan(after, before - 40, "Celebration should launch the mascot upward") }
            }
        }
    }

    @MainActor
    func testVisibilityRespectsScrollingAndHiddenAncestors() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
        container.clipsToBounds = true
        window.addSubview(container)
        let avatar = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
        container.addSubview(avatar)
        window.isHidden = false
        defer { avatar.removeFromSuperview(); window.isHidden = true }
        XCTAssertTrue(avatar.isVisible)
        avatar.frame.origin.y = 150
        XCTAssertFalse(avatar.isVisible, "An avatar outside a scroll viewport must pause")
        avatar.frame.origin.y = 0
        container.isHidden = true
        XCTAssertFalse(avatar.isVisible)
        container.isHidden = false
        avatar.removeFromSuperview()
        XCTAssertFalse(avatar.isVisible, "Detached views must not animate")
    }

    @MainActor
    func testNativeMasksLeaveEyesTransparentAndPNGsAreBundled() throws {
        let asset = try XCTUnwrap(NSDataAsset(name: "AgentCharacters"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: asset.data) as? [String: [String: Any]])
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1; format.opaque = false
        var images: [UIImage] = []
        for name in AvatarCatalog.characters {
            XCTAssertNotNil(UIImage(named: "agent_\(name)"))
            let view = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 1024, height: 1024))
            view.configure(name: name, state: .idle, reduced: true, active: false)
            let image = UIGraphicsImageRenderer(size: view.bounds.size, format: format).image { _ in view.draw(view.bounds) }
            images.append(image)
            let cg = try XCTUnwrap(image.cgImage)
            var pixels = [UInt8](repeating: 0, count: 1024 * 1024 * 4)
            try pixels.withUnsafeMutableBytes { buffer in
                let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1024, height: 1024, bitsPerComponent: 8,
                    bytesPerRow: 4096, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
                context.draw(cg, in: view.bounds)
            }
            let eyes = try XCTUnwrap(json[name]?["eyes"] as? [[String: Any]])
            for eye in eyes {
                let x = Int(try XCTUnwrap(eye["cx"] as? Double))
                let y = Int(try XCTUnwrap(eye["cy"] as? Double))
                XCTAssertEqual(pixels[(y * 1024 + x) * 4 + 3], 0, "\(name) eye must be a transparent cut-out")
            }
            XCTAssertTrue(stride(from: 3, to: pixels.count, by: 4).contains { pixels[$0] == 255 }, "Body must render")
        }
        // Native rendering on two backgrounds, retained with the test results for visual QA.
        let preview = UIGraphicsImageRenderer(size: CGSize(width: 1000, height: 400), format: format).image { ctx in
            UIColor(red: 0.95, green: 0.93, blue: 0.87, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 1000, height: 200))
            UIColor(white: 0.12, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 200, width: 1000, height: 200))
            for (i, image) in images.enumerated() {
                image.draw(in: CGRect(x: i * 200, y: 0, width: 200, height: 200))
                image.draw(in: CGRect(x: i * 200, y: 200, width: 200, height: 200))
            }
        }
        let attachment = XCTAttachment(image: preview)
        attachment.name = "Agent avatars — native masks"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
