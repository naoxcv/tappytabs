// Owner: Role 1 (fixtures, store) + Role 2 (tap detector, join links).
import XCTest
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
