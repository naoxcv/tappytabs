// Owner: Role 1 (fixtures, store) + Role 2 (tap detector, join links).
import XCTest
import UIKit
@testable import TappyTabs

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


final class AgentAvatarTests: XCTestCase {
    func testLegacyIDsKeepTheirCharactersWhenReordered() {
        let expected = ["tomato", "mushroom", "bokchoy", "garlic", "cat", "tomato", "mushroom", "bokchoy"]
        for n in (1...8).reversed() {
            XCTAssertEqual(AvatarCatalog.character("avatar_\(n)"), expected[n - 1])
        }
        XCTAssertEqual(AvatarCatalog.character("restaurant"), "cat")
        XCTAssertEqual(AvatarCatalog.character("tomato"), "tomato")
        XCTAssertTrue(AvatarCatalog.characters.contains(AvatarCatalog.character("unknown-agent")))
    }

    @MainActor
    func testHappyHopAndReducedMotion() throws {
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
        for reduced in [false, true] {
            let view = AgentDrawingView(frame: CGRect(x: 0, y: 0, width: 1024, height: 1024))
            view.configure(name: "tomato", state: .happy, reduced: reduced, active: true)
            let before = try topEdge(view)
            for _ in 0..<9 { view.advance(dt: 1.0 / 30, pointer: nil) }
            let after = try topEdge(view)
            if reduced { XCTAssertEqual(after, before, "Reduce Motion must suppress the success hop and sway") }
            else { XCTAssertLessThan(after, before - 40, "Success should launch the mascot upward") }
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
