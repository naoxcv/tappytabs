// Owner: Role 1. ONE observable object per running party. Screens never subscribe on their own.
// Opens the subscriptions, keeps the server-clock offset for bubble pacing, and wraps every mutation
// as an async method that maps error codes to UI (BAD_STATUS is ignored: the subscription will route).
import Combine
import Foundation
import Observation

@Observable
final class PartyStore {
    let partyId: String
    let userId: String?          // nil on the restaurant phone
    let deviceId: String
    @ObservationIgnored let backend: Backend

    private(set) var party: Party?
    private(set) var bubbles: [Bubble] = []
    private(set) var serverOffsetMs: Double = 0   // server clock − local clock
    private(set) var candidates: [Candidate] = []
    private(set) var lines: LinesPayload = .empty
    var lastError: TTError?
    private(set) var reconnecting = false

    @ObservationIgnored private var bag = Set<AnyCancellable>()

    init(partyId: String, userId: String?, deviceId: String, backend: Backend) {
        self.partyId = partyId
        self.userId = userId
        self.deviceId = deviceId
        self.backend = backend
    }

    func start() {
        stop()
        backend.party(partyId).sink(receiveCompletion: fail, receiveValue: { [weak self] in self?.party = $0; self?.reconnecting = false }).store(in: &bag)
        backend.messages(partyId).sink(receiveCompletion: fail, receiveValue: { [weak self] payload in
            self?.serverOffsetMs = payload.serverNow - Date().ms
            self?.bubbles = payload.messages
        }).store(in: &bag)
        backend.lines(partyId).sink(receiveCompletion: fail, receiveValue: { [weak self] in self?.lines = $0 }).store(in: &bag)
        if let userId {
            backend.candidates(partyId, userId: userId).sink(receiveCompletion: fail, receiveValue: { [weak self] in self?.candidates = $0 }).store(in: &bag)
        }
    }

    func stop() { bag.removeAll() }

    private func fail(_ completion: Subscribers.Completion<TTError>) {
        if case .failure = completion { reconnecting = true }
    }

    // MARK: derived

    var me: Member? { party?.member(userId) }
    var serverNowMs: Double { Date().ms + serverOffsetMs }

    /// Bubbles whose showAt has passed on the server's clock. Call from a TimelineView tick.
    func visibleBubbles(at date: Date) -> [Bubble] {
        let t = date.ms + serverOffsetMs
        return bubbles.filter { $0.showAt <= t }
    }

    var mains: [Candidate] { candidates.filter { !$0.isDrink }.sorted { $0.rank < $1.rank } }
    var drink: Candidate? { candidates.first { $0.isDrink } }
    var sharedLines: [Line] { lines.lines.filter(\.isShared) }
    func myLines(_ userId: String? = nil) -> [Line] {
        let uid = userId ?? self.userId
        return lines.lines.filter { !$0.isShared && $0.sharedBy.contains(uid ?? "") }
    }
    var myShareCents: Double { lines.totals.perUser[userId ?? ""] ?? 0 }
    func name(of userId: String) -> String { party?.member(userId)?.name ?? "Someone" }
    func avatar(of userId: String?) -> String? { userId.flatMap { party?.member($0)?.avatarId } }

    // MARK: diner mutations

    func setHunger(_ hunger: Hunger) async { await run { [self] in try await backend.setHunger(partyId: partyId, userId: userId!, deviceId: deviceId, hunger: hunger) } }
    func pick(_ itemId: String) async { await run { [self] in try await backend.pick(partyId: partyId, userId: userId!, deviceId: deviceId, itemId: itemId) } }
    func add(_ itemId: String, shared: Bool) async { await run { [self] in try await backend.add(partyId: partyId, userId: userId!, deviceId: deviceId, itemId: itemId, shared: shared) } }
    func confirm() async { await run { [self] in try await backend.confirm(partyId: partyId, userId: userId!, deviceId: deviceId) } }
    func remove(_ lineId: String) async -> RemoveResult.Substitute? {
        var sub: RemoveResult.Substitute?
        await run { [self] in sub = try await backend.remove(partyId: partyId, userId: userId!, deviceId: deviceId, lineId: lineId).substitute }
        return sub
    }

    // MARK: restaurant mutations (deviceId is the host device)

    func startWithFewer() async { await run { [self] in try await backend.startWithFewer(partyId: partyId, hostDeviceId: deviceId) } }
    func reset() async { await run { [self] in try await backend.reset(partyId: partyId, hostDeviceId: deviceId) } }
    func admit(userId: String, via: JoinVia) async -> TTError? {
        do {
            _ = try await backend.join(partyId: partyId, joinCode: nil, userId: userId, via: via, hostDeviceId: deviceId, deviceId: nil)
            return nil
        } catch {
            let e = TTError.from(error)
            if e.code != .BAD_STATUS { lastError = e }
            return e
        }
    }

    @MainActor
    private func run(_ f: @escaping () async throws -> Void) async {
        do { try await f() } catch {
            let e = TTError.from(error)
            if e.code == .BAD_STATUS { return } // server moved on; subscriptions will route the screen
            lastError = e
        }
    }
}

extension Date {
    var ms: Double { timeIntervalSince1970 * 1000 }
}
