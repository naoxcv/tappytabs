// Owner: Role 1 (Role 2 uses it too). A local simulator over the JSON fixtures in Core/Mocks
// (regenerate them with `node scripts/export-fixtures.mjs`). It walks the party through every status
// on timers, so both modes are fully clickable with no backend. Debug menu → "Jump to status" for any screen.
import Combine
import Foundation

final class MockBackend: Backend {
    static let restaurantId = "mock-restaurant"

    // Fixtures
    let ids: MockIds
    private let pickParty: Party
    private let confirmParty: Party
    private let placedParty: Party
    private let fixtureMessages: MessagesPayload
    private let fixtureCandidates: [Candidate]
    private let linesPick: LinesPayload
    private let linesConfirm: LinesPayload
    private let linesPlaced: LinesPayload
    private let addablePersonal: [AddableItem]
    private let addableShared: [AddableItem]
    private let removeResult: RemoveResult
    private let menu: MenuStatus

    // Live state
    private let partySubject = CurrentValueSubject<Party?, TTError>(nil)
    private let messagesSubject = CurrentValueSubject<MessagesPayload, TTError>(MessagesPayload(serverNow: 0, messages: []))
    private let candidatesSubject = CurrentValueSubject<[Candidate], TTError>([])
    private let linesSubject = CurrentValueSubject<LinesPayload, TTError>(.empty)
    private var me: String { ids.userIds[0] }
    private let delay: Double

    struct MockIds: Decodable { let partyId: String; let userIds: [String]; let restaurantId: String; let hostDeviceId: String }

    init(stepDelay: Double = 1.0) {
        delay = stepDelay
        ids = Fixtures.load("ids")
        pickParty = Fixtures.load("party_pick")
        confirmParty = Fixtures.load("party_confirm")
        placedParty = Fixtures.load("party_placed")
        fixtureMessages = Fixtures.load("messages")
        fixtureCandidates = Fixtures.load("candidates")
        linesPick = Fixtures.load("lines_pick")
        linesConfirm = Fixtures.load("lines_confirm")
        linesPlaced = Fixtures.load("lines_placed")
        addablePersonal = Fixtures.load("addable_personal")
        addableShared = Fixtures.load("addable_shared")
        removeResult = Fixtures.load("remove_result")
        menu = Fixtures.load("menu_status")
    }

    // MARK: Debug controls

    /// Put the party straight into a status with fixture data (debug menu).
    func jump(to status: PartyStatus) {
        let base = pickParty
        switch status {
        case .checkin:
            setParty(base.with(status: .checkin, members: Array(base.members.prefix(2)).map { $0.with(hunger: nil) }))
            linesSubject.send(.empty); messagesSubject.send(MessagesPayload(serverNow: now, messages: []))
        case .hunger:
            setParty(base.with(status: .hunger, members: base.members.enumerated().map { $0.element.with(hunger: $0.offset == 0 ? nil : .normal) }))
        case .negotiating:
            setParty(base.with(status: .negotiating)); playMessages(thenAdvance: false)
        case .pick:
            setParty(base); candidatesSubject.send(fixtureCandidates); linesSubject.send(linesPick); messagesSubject.send(rebased(spread: false))
        case .confirm:
            setParty(confirmParty.with(confirmDeadline: now + 45_000)); candidatesSubject.send(fixtureCandidates); linesSubject.send(linesConfirm)
        case .placed:
            setParty(placedParty); linesSubject.send(linesPlaced)
        }
    }

    /// Restaurant mode: pretend the next fixture diner tapped in.
    func simulateTap() {
        guard let p = partySubject.value, p.status == .checkin else { return }
        let next = pickParty.members.first { m in !p.members.contains { $0.userId == m.userId } }
        guard let next else { return }
        _ = try? joinSync(userId: next.userId)
    }

    // MARK: Backend

    func party(_ partyId: String) -> AnyPublisher<Party?, TTError> { onMain(partySubject) }
    func messages(_ partyId: String) -> AnyPublisher<MessagesPayload, TTError> {
        onMain(messagesSubject.map { MessagesPayload(serverNow: Date().timeIntervalSince1970 * 1000, messages: $0.messages) })
    }
    func candidates(_ partyId: String, userId: String) -> AnyPublisher<[Candidate], TTError> { onMain(candidatesSubject) }
    func lines(_ partyId: String) -> AnyPublisher<LinesPayload, TTError> { onMain(linesSubject) }
    func menuStatus(_ restaurantId: String) -> AnyPublisher<MenuStatus?, TTError> { onMain(Just(Optional(menu)).setFailureType(to: TTError.self)) }
    func addable(_ partyId: String, userId: String, shared: Bool) -> AnyPublisher<[AddableItem], TTError> {
        onMain(Just(shared ? addableShared : addablePersonal).setFailureType(to: TTError.self))
    }
    func pendingTaps(partyId: String, hostDeviceId: String) -> AnyPublisher<[TapRequest], TTError> {
        onMain(Just([]).setFailureType(to: TTError.self))
    }
    func tapSession(partyId: String, userId: String, deviceId: String) -> AnyPublisher<TapSession?, TTError> {
        onMain(Just(nil).setFailureType(to: TTError.self))
    }
    func forUserUpdates(userId: String) -> AnyPublisher<HostedParty?, TTError> {
        onMain(partySubject.map { party in
            guard let party, party.status != .placed, party.member(userId) != nil else { return nil }
            return HostedParty(partyId: party.id, status: party.status)
        })
    }
    func announceTap(partyId: String, userId: String, deviceId: String, attemptId: String, token: String) async throws {}
    func respondTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, token: String) async throws {}
    func rejectTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, reason: String) async throws {}

    private func onMain<P: Publisher>(_ p: P) -> AnyPublisher<P.Output, TTError> where P.Failure == TTError {
        p.receive(on: DispatchQueue.main).eraseToAnyPublisher()
    }

    func me(deviceId: String) async throws -> UserProfile? { nil }
    func restaurants() async throws -> [RestaurantRef] { [RestaurantRef(id: Self.restaurantId, name: menu.name)] }
    func hosted(hostDeviceId: String) async throws -> HostedParty? { partySubject.value.map { HostedParty(partyId: $0.id, status: $0.status) } }
    func forUser(userId: String) async throws -> HostedParty? {
        guard let party = partySubject.value, party.status != .placed, party.member(userId) != nil else { return nil }
        return HostedParty(partyId: party.id, status: party.status)
    }

    func upsertUser(deviceId: String, profile: DraftProfile) async throws -> String { me }
    func followups(draft: DraftProfile) async throws -> [FollowUpQuestion] {
        try await Task.sleep(for: .milliseconds(400))
        return [
            FollowUpQuestion(id: "price", question: "When you eat out, what matters most?", options: ["Taste", "Price", "Trying new things"]),
            FollowUpQuestion(id: "portion", question: "How big is your usual appetite?", options: ["Light", "Normal", "Huge"]),
        ]
    }
    func summarize(userId: String, answers: [FollowUpAnswer]) async throws -> ProfileSummary {
        ProfileSummary(profileSummary: "You love noodles and anything spicy, and your agent will always steer clear of shellfish.", personality: .adventurous)
    }

    func ingestMenu(restaurantId: String) async throws -> IngestResult {
        try await Task.sleep(for: .seconds(1))
        return IngestResult(count: menu.itemCount, source: "seed", apifyRunId: nil, note: "mock")
    }

    func createParty(restaurantId: String, size: Int, hostDeviceId: String) async throws -> CreatedParty {
        setParty(pickParty.with(status: .checkin, size: Double(size), members: []))
        linesSubject.send(.empty); candidatesSubject.send([]); messagesSubject.send(MessagesPayload(serverNow: now, messages: []))
        return CreatedParty(partyId: pickParty.id, joinCode: pickParty.joinCode)
    }

    func startWithFewer(partyId: String, hostDeviceId: String) async throws {
        guard let p = partySubject.value else { throw TTError(code: .NOT_FOUND, message: "No party") }
        guard p.status == .checkin else { throw TTError(code: .BAD_STATUS, message: "Not checking in") }
        guard p.members.count >= 2 else { throw TTError(code: .INVALID, message: "Need at least 2 diners") }
        setParty(p.with(status: .hunger, size: Double(p.members.count)))
    }

    func reset(partyId: String, hostDeviceId: String) async throws {
        _ = try await createParty(restaurantId: Self.restaurantId, size: Int(partySubject.value?.size ?? 4), hostDeviceId: hostDeviceId)
    }

    func join(partyId: String?, joinCode: String?, userId: String, via: JoinVia,
              hostDeviceId: String?, deviceId: String?) async throws -> JoinResult {
        if partySubject.value == nil { _ = try await createParty(restaurantId: Self.restaurantId, size: 4, hostDeviceId: ids.hostDeviceId) }
        return try joinSync(userId: userId)
    }

    func leave(partyId: String, userId: String, deviceId: String) async throws {
        guard let party = partySubject.value, party.id == partyId else { throw TTError(code: .NOT_FOUND, message: "Table not found") }
        if party.status == .placed { return }
        setParty(party.with(members: party.members.filter { $0.userId != userId }))
    }

    private func joinSync(userId: String) throws -> JoinResult {
        guard let p = partySubject.value else { throw TTError(code: .NOT_FOUND, message: "Table not found") }
        if p.members.contains(where: { $0.userId == userId }) { return JoinResult(result: "already", partyId: p.id) }
        guard p.status == .checkin else { throw TTError(code: .BAD_STATUS, message: "Party is \(p.status.rawValue)") }
        guard Double(p.members.count) < p.size else { throw TTError(code: .FULL, message: "Table is full") }
        let fixture = pickParty.members.first { $0.userId == userId }
            ?? Member(userId: userId, name: "You", avatarId: "avatar_5", hunger: nil, picked: false, confirmed: false)
        let members = p.members + [fixture.with(hunger: nil)]
        setParty(p.with(status: Double(members.count) == p.size ? .hunger : .checkin, members: members))
        return JoinResult(result: "joined", partyId: p.id)
    }

    func setHunger(partyId: String, userId: String, deviceId: String, hunger: Hunger) async throws {
        try requireStatus(.hunger)
        updateMember(userId) { $0.with(hunger: hunger) }
        // Everyone else chooses a moment later.
        after(delay) { [self] in
            for m in partySubject.value?.members ?? [] where m.hunger == nil { updateMember(m.userId) { $0.with(hunger: .normal) } }
            guard let p = partySubject.value, p.status == .hunger else { return }
            setParty(p.with(status: .negotiating))
            playMessages(thenAdvance: true)
        }
    }

    func pick(partyId: String, userId: String, deviceId: String, itemId: String) async throws {
        try requireStatus(.pick)
        updateMember(userId) { $0.with(picked: true) }
        after(delay) { [self] in
            setParty(confirmParty.with(confirmDeadline: now + 45_000))
            linesSubject.send(linesConfirm)
        }
    }
    func cacheDishCutout(partyId: String, userId: String, deviceId: String, itemId: String, sourceImageUrl: String, pngData: Data) async throws {}

    func add(partyId: String, userId: String, deviceId: String, itemId: String, shared: Bool) async throws {
        try requireStatus(.confirm)
        let pool = shared ? addableShared : addablePersonal
        guard let item = pool.first(where: { $0.itemId == itemId }) else { throw TTError(code: .UNSAFE, message: "That dish isn't safe for you") }
        let sharers = shared ? (partySubject.value?.members.map(\.userId) ?? [userId]) : [userId]
        let line = Line(lineId: UUID().uuidString, itemId: item.itemId, name: item.name, qty: 1, priceCents: item.priceCents,
                        kind: shared ? "shared" : "extra", sharedBy: sharers, addedBy: userId, askServer: item.askServer)
        publishLines(linesSubject.value.lines + [line])
    }

    func remove(partyId: String, userId: String, deviceId: String, lineId: String) async throws -> RemoveResult {
        try requireStatus(.confirm)
        var lines = linesSubject.value.lines
        guard let i = lines.firstIndex(where: { $0.lineId == lineId }) else { throw TTError(code: .NOT_FOUND, message: "Line not found") }
        let rest = lines[i].sharedBy.filter { $0 != userId }
        if rest.isEmpty { lines.remove(at: i) } else {
            let l = lines[i]
            lines[i] = Line(lineId: l.lineId, itemId: l.itemId, name: l.name, qty: l.qty, priceCents: l.priceCents,
                            kind: l.kind, sharedBy: rest, addedBy: l.addedBy, askServer: l.askServer)
        }
        publishLines(lines)
        return removeResult
    }

    func confirm(partyId: String, userId: String, deviceId: String) async throws {
        try requireStatus(.confirm)
        updateMember(userId) { $0.with(confirmed: true) }
        after(delay) { [self] in
            guard let p = partySubject.value else { return }
            setParty(p.with(status: .placed, members: p.members.map { $0.with(confirmed: true) }))
        }
    }

    // MARK: helpers

    private var now: Double { Date().timeIntervalSince1970 * 1000 }
    private func setParty(_ p: Party) { partySubject.send(p) }

    private func requireStatus(_ s: PartyStatus) throws {
        guard partySubject.value?.status == s else { throw TTError(code: .BAD_STATUS, message: "Wrong status") }
    }

    private func updateMember(_ userId: String, _ f: (Member) -> Member) {
        guard let p = partySubject.value else { return }
        setParty(p.with(members: p.members.map { $0.userId == userId ? f($0) : $0 }))
    }

    private func rebased(spread: Bool) -> MessagesPayload {
        let start = now + 500
        var nextShowAt = start
        let msgs = fixtureMessages.messages.map { m in
            let showAt = spread ? nextShowAt : now - 1000
            if spread { nextShowAt = showAt + Self.bubbleDisplayDurationMs(m.text) }
            return Bubble(id: m.id, fromUserId: m.fromUserId, text: m.text, showAt: showAt)
        }
        return MessagesPayload(serverNow: now, messages: msgs)
    }

    private static func bubbleDisplayDurationMs(_ text: String) -> Double {
        max(2500, 1200 + Double(text.trimmingCharacters(in: .whitespacesAndNewlines).count) * 15)
    }

    private func playMessages(thenAdvance: Bool) {
        let payload = rebased(spread: true)
        messagesSubject.send(payload)
        guard thenAdvance, let last = payload.messages.last else { return }
        after((last.showAt - now + Self.bubbleDisplayDurationMs(last.text)) / 1000) { [self] in
            guard partySubject.value?.status == .negotiating else { return }
            candidatesSubject.send(fixtureCandidates)
            linesSubject.send(linesPick)
            setParty(pickParty.with(pickDeadline: now + 45_000))
        }
    }

    private func publishLines(_ lines: [Line]) {
        var perUser: [String: Double] = [:]
        var total = 0.0
        for l in lines {
            let price = l.priceCents * l.qty
            total += price
            let share = (price / Double(max(1, l.sharedBy.count))).rounded(.down)
            for (i, u) in l.sharedBy.enumerated() {
                perUser[u, default: 0] += share + (i == 0 ? price - share * Double(l.sharedBy.count) : 0)
            }
        }
        linesSubject.send(LinesPayload(lines: lines, totals: Totals(perUser: perUser, total: total)))
    }

    private func after(_ seconds: Double, _ f: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: f)
    }
}

enum Fixtures {
    static func load<T: Decodable>(_ name: String) -> T {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json")
                ?? Bundle(for: MockBackend.self).url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url) else { fatalError("Missing fixture \(name).json") }
        do { return try JSONDecoder().decode(T.self, from: data) } catch { fatalError("Fixture \(name).json: \(error)") }
    }
}

// Copy-with helpers so mocks and previews can tweak immutable models.
extension Party {
    func with(status: PartyStatus? = nil, size: Double? = nil, members: [Member]? = nil,
              pickDeadline: Double? = nil, confirmDeadline: Double? = nil) -> Party {
        Party(id: id, restaurantName: restaurantName, status: status ?? self.status, size: size ?? self.size, joinCode: joinCode,
              pickDeadline: pickDeadline ?? self.pickDeadline, confirmDeadline: confirmDeadline ?? self.confirmDeadline,
              members: members ?? self.members)
    }
}

extension Member {
    func with(hunger: Hunger?) -> Member {
        Member(userId: userId, name: name, avatarId: avatarId, hunger: hunger, picked: picked, confirmed: confirmed)
    }
    func with(picked: Bool? = nil, confirmed: Bool? = nil) -> Member {
        Member(userId: userId, name: name, avatarId: avatarId, hunger: hunger, picked: picked ?? self.picked, confirmed: confirmed ?? self.confirmed)
    }
}
