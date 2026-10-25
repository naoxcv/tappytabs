// Nearby table IDs come only from Multipeer. Convex relays UWB tokens for every discovered table.
import Combine
import Foundation
import MultipeerConnectivity
import NearbyInteraction
import Observation
import UIKit

struct NearbyTable: Identifiable, Equatable {
    enum Phase: String { case discovered, exchanging, tokenReady, ranging, measuring, capacity, rejected }
    let partyId: String
    let phase: Phase
    let distance: Float?
    var id: String { partyId }
    var isInRange: Bool { phase == .measuring && distance != nil }
}

@Observable
final class Proximity: NSObject {
    static let shared = Proximity()
    static let serviceType = "tappytabs"
    enum State: Equatable { case idle, searching, preparing, connected, tapped, rejected(String) }

    private(set) var state: State = .idle
    private(set) var debugEvent = "idle"
    private(set) var debugHistory: [String] = []
    private(set) var debugDistances: [String: Float] = [:]
    private(set) var debugTapCounts: [String: Int] = [:]
    private(set) var nearbyTables: [NearbyTable] = []
    var inRangeTableCount: Int { nearbyTables.filter(\.isInRange).count }
    private(set) var tappedPartyId: String?
    var config = TapConfig()
    var supportsTap: Bool { NISession.deviceCapabilities.supportsPreciseDistanceMeasurement }
    var hasCapacityOverflow: Bool { nearbyTables.contains { $0.phase == .capacity } }
    func setThreshold(_ metres: Float) { config.thresholdMetres = metres }

    @ObservationIgnored private var backend: Backend?
    @ObservationIgnored private var peer: MCPeerID?
    @ObservationIgnored private var advertiser: MCNearbyServiceAdvertiser?
    @ObservationIgnored private var browser: MCNearbyServiceBrowser?
    @ObservationIgnored private var distanceExpiryTimer: Timer?
    @ObservationIgnored private var lastDistanceAt: [String: Date] = [:]
    @ObservationIgnored private var pendingWatch: AnyCancellable?
    @ObservationIgnored private var sessionWatches: [String: AnyCancellable] = [:]
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var isHost = false
    @ObservationIgnored private var hostedPartyId: String?
    @ObservationIgnored private var myUserId: String?
    @ObservationIgnored private var deviceId: String?
    @ObservationIgnored private var nearbyPeers: [String: MCPeerID] = [:]
    @ObservationIgnored private var lostMarkers: [String: UUID] = [:]
    @ObservationIgnored private var phases: [String: NearbyTable.Phase] = [:]
    @ObservationIgnored private var dinerAttempts: [String: String] = [:]
    @ObservationIgnored private var hostAttempts: [String: String] = [:]
    @ObservationIgnored private var hostTokens: [String: String] = [:]
    @ObservationIgnored private var niSessions: [String: NISession] = [:]
    @ObservationIgnored private var detectors: [String: TapDetector] = [:]
    @ObservationIgnored private var hasDistance: Set<String> = []
    @ObservationIgnored private var rangingUpdates: Set<String> = []
    @ObservationIgnored private var capacityLimited = false
    @ObservationIgnored private var focusedPartyId: String?
    @ObservationIgnored private var onTableDiscovered: ((String) -> Void)?
    @ObservationIgnored private var onTableLost: ((String) -> Void)?
    @ObservationIgnored private var onTapped: (() -> Void)?
    @ObservationIgnored private var onRejected: ((String) -> Void)?
    @ObservationIgnored private var onTap: ((String) -> Void)?

    func startDinerTapIn(userId: String, deviceId: String, backend: Backend,
                         onTableDiscovered: @escaping (String) -> Void,
                         onTableLost: @escaping (String) -> Void,
                         onTapped: @escaping () -> Void,
                         onRejected: @escaping (String) -> Void) {
        stop()
        self.backend = backend; myUserId = userId; self.deviceId = deviceId
        self.onTableDiscovered = onTableDiscovered; self.onTableLost = onTableLost
        self.onTapped = onTapped; self.onRejected = onRejected
        guard supportsTap else {
            state = .searching
            record("precise UWB unavailable; use QR")
            return
        }
        let peer = MCPeerID(displayName: "diner-\(userId.suffix(6))")
        self.peer = peer
        let browser = MCNearbyServiceBrowser(peer: peer, serviceType: Self.serviceType)
        browser.delegate = self; self.browser = browser
        state = .searching
        record("discovering nearby tables")
        browser.startBrowsingForPeers()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.expireStaleDistances() }
        distanceExpiryTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    func startHosting(partyId: String, hostDeviceId: String, backend: Backend,
                      onTap: @escaping (String) -> Void) {
        stop()
        isHost = true; hostedPartyId = partyId; deviceId = hostDeviceId
        self.backend = backend; self.onTap = onTap
        guard supportsTap else {
            state = .searching
            record("precise UWB unavailable; use QR")
            return
        }
        let peer = MCPeerID(displayName: "table-\(partyId.suffix(6))")
        self.peer = peer
        pendingWatch = backend.pendingTaps(partyId: partyId, hostDeviceId: hostDeviceId)
            .sink(receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion { self?.record("token watch failed: \(error.userMessage)") }
            }, receiveValue: { [weak self] requests in
                guard let self else { return }
                for request in requests { self.accept(request) }
            })
        let advertiser = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["partyId": partyId], serviceType: Self.serviceType)
        advertiser.delegate = self; self.advertiser = advertiser
        state = .searching
        record("advertising nearby table \(partyId.suffix(6)); waiting for tokens")
        advertiser.startAdvertisingPeer()
    }

    func restartConnection() {
        guard state != .idle, let backend, let deviceId else { return }
        if isHost, let hostedPartyId, let onTap {
            startHosting(partyId: hostedPartyId, hostDeviceId: deviceId, backend: backend, onTap: onTap)
        } else if let myUserId, let onTableDiscovered, let onTableLost, let onTapped, let onRejected {
            startDinerTapIn(userId: myUserId, deviceId: deviceId, backend: backend,
                            onTableDiscovered: onTableDiscovered, onTableLost: onTableLost,
                            onTapped: onTapped, onRejected: onRejected)
        }
    }

    /// Explicit overflow choice. Release other sessions, then prepare this table with fresh tokens.
    func focus(on partyId: String) {
        guard !isHost, phases[partyId] != nil, state != .tapped else { return }
        focusedPartyId = partyId
        capacityLimited = false
        for key in niSessions.keys.filter({ $0 != partyId }) { releaseSession(for: key) }
        for key in phases.keys where key != partyId {
            phases[key] = hostTokens[key] == nil ? .exchanging : .tokenReady
        }
        record("focusing table \(partyId.suffix(6))")
        announce(to: partyId)
        publishTables()
    }

    func reject(userId: String, reason: String) {
        guard isHost, let hostedPartyId, let deviceId, let backend, let attempt = hostAttempts[userId] else { return }
        let current = generation
        Task { [weak self] in
            do {
                try await backend.rejectTap(partyId: hostedPartyId, userId: userId, hostDeviceId: deviceId,
                                            attemptId: attempt, reason: reason)
            } catch {
                guard self?.generation == current else { return }
                self?.record("rejection failed: \(error.localizedDescription)")
            }
        }
    }

    func forgetDiner(_ userId: String) {
        guard isHost else { return }
        hostAttempts[userId] = nil
        releaseSession(for: userId)
        record("diner \(userId.suffix(6)) left table")
    }

    func stop() {
        generation = UUID()
        distanceExpiryTimer?.invalidate(); distanceExpiryTimer = nil
        lastDistanceAt = [:]
        advertiser?.stopAdvertisingPeer(); advertiser = nil
        browser?.stopBrowsingForPeers(); browser = nil
        pendingWatch = nil; sessionWatches = [:]
        niSessions.values.forEach { $0.invalidate() }
        niSessions = [:]; detectors = [:]; hasDistance = []; rangingUpdates = []
        nearbyPeers = [:]; lostMarkers = [:]; phases = [:]
        dinerAttempts = [:]; hostAttempts = [:]; hostTokens = [:]
        capacityLimited = false; focusedPartyId = nil
        backend = nil; peer = nil; isHost = false
        hostedPartyId = nil; myUserId = nil; deviceId = nil
        onTableDiscovered = nil; onTableLost = nil; onTapped = nil; onRejected = nil; onTap = nil
        debugDistances = [:]; debugTapCounts = [:]; nearbyTables = []; tappedPartyId = nil
        state = .idle; debugEvent = "idle"; debugHistory = []
    }

    private func record(_ event: String) {
        debugEvent = event
        debugHistory.append(event)
        if debugHistory.count > 6 { debugHistory.removeFirst() }
    }
    private func tokenString(_ session: NISession) -> String? {
        guard let token = session.discoveryToken,
              let data = try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true) else { return nil }
        return data.base64EncodedString()
    }
    private func peerToken(_ encoded: String) -> NIDiscoveryToken? {
        guard let data = Data(base64Encoded: encoded) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: NIDiscoveryToken.self, from: data)
    }
    private func newSession(for key: String) -> NISession {
        releaseSession(for: key)
        let session = NISession()
        session.delegate = self
        niSessions[key] = session
        var detector = TapDetector(); detector.config = config
        detectors[key] = detector
        debugDistances[key] = nil; debugTapCounts[key] = nil
        hasDistance.remove(key)
        rangingUpdates.remove(key)
        return session
    }
    private func releaseSession(for key: String) {
        let session = niSessions.removeValue(forKey: key)
        session?.invalidate()
        detectors[key] = nil
        debugDistances[key] = nil; debugTapCounts[key] = nil
        hasDistance.remove(key)
        rangingUpdates.remove(key)
        lastDistanceAt[key] = nil
    }

    private func expireStaleDistances() {
        let now = Date()
        let staleKeys = lastDistanceAt.filter { now.timeIntervalSince($0.value) >= 5 }.map(\.key)
        for key in staleKeys {
            record("UWB distance expired for \(key.suffix(6))")
            distanceUpdate(nil, for: key)
        }
    }

    private func foundTable(_ partyId: String, from peerID: MCPeerID) {
        guard !isHost, state != .tapped, let backend, let myUserId, let deviceId else { return }
        nearbyPeers[partyId] = peerID
        lostMarkers[partyId] = nil
        guard phases[partyId] == nil else { return }
        phases[partyId] = .discovered
        record("found nearby table \(partyId.suffix(6))")
        publishTables()
        onTableDiscovered?(partyId)
        sessionWatches[partyId] = backend.tapSession(partyId: partyId, userId: myUserId, deviceId: deviceId)
            .sink(receiveCompletion: { [weak self] completion in
                if case .failure(let error) = completion { self?.record("token watch failed for \(partyId.suffix(6)): \(error.userMessage)") }
            }, receiveValue: { [weak self] response in self?.receive(response, for: partyId) })
        announce(to: partyId)
    }
    private func lostTable(_ partyId: String, from peerID: MCPeerID) {
        guard nearbyPeers[partyId] == peerID else { return }
        let marker = UUID()
        lostMarkers[partyId] = marker
        expireTable(partyId, marker: marker)
    }
    private func expireTable(_ partyId: String, marker: UUID) {
        let current = generation
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            guard let self, self.generation == current, self.lostMarkers[partyId] == marker else { return }
            if self.hasDistance.contains(partyId) { self.expireTable(partyId, marker: marker) }
            else { self.removeTable(partyId) }
        }
    }
    private func removeTable(_ partyId: String) {
        guard phases[partyId] != nil else { return }
        nearbyPeers[partyId] = nil; lostMarkers[partyId] = nil
        phases[partyId] = nil; dinerAttempts[partyId] = nil; hostTokens[partyId] = nil
        sessionWatches[partyId] = nil
        releaseSession(for: partyId)
        if focusedPartyId == partyId { focusedPartyId = nil; capacityLimited = false }
        record("nearby table \(partyId.suffix(6)) left")
        onTableLost?(partyId)
        publishTables()
    }

    private func announce(to partyId: String) {
        guard !isHost, state != .tapped, phases[partyId] != nil,
              let myUserId, let deviceId, let backend else { return }
        if phases[partyId] == .rejected { return }
        let ni = newSession(for: partyId)
        guard let token = tokenString(ni) else { record("UWB token unavailable for \(partyId.suffix(6))"); return }
        let attempt = UUID().uuidString
        dinerAttempts[partyId] = attempt; hostTokens[partyId] = nil
        phases[partyId] = .exchanging
        publishTables()
        let current = generation
        record("sending token to table \(partyId.suffix(6))")
        Task { [weak self] in
            do {
                try await backend.announceTap(partyId: partyId, userId: myUserId, deviceId: deviceId,
                                              attemptId: attempt, token: token)
                guard let self, self.generation == current, self.dinerAttempts[partyId] == attempt else { return }
                self.record("waiting for table \(partyId.suffix(6)) token")
            } catch {
                guard let self, self.generation == current, self.dinerAttempts[partyId] == attempt else { return }
                let failure = TTError.from(error)
                self.record("token send failed for \(partyId.suffix(6)): \(failure.userMessage)")
                if failure.code == .BAD_STATUS || failure.code == .FULL {
                    self.rejectTable(partyId, reason: failure.userMessage)
                } else {
                    self.retry(partyId, after: 2, attempt: attempt)
                }
            }
        }
        retry(partyId, after: 8, attempt: attempt)
    }
    private func retry(_ partyId: String, after seconds: Double, attempt: String) {
        let current = generation
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard let self, self.generation == current, self.dinerAttempts[partyId] == attempt,
                  self.phases[partyId] == .exchanging, self.state != .tapped else { return }
            self.record("token timeout for \(partyId.suffix(6)); retrying")
            self.announce(to: partyId)
        }
    }

    private func accept(_ request: TapRequest) {
        guard isHost, let hostedPartyId, let deviceId, let backend,
              hostAttempts[request.userId] != request.attemptId else { return }
        guard let token = peerToken(request.dinerToken) else { record("invalid diner token"); return }
        let ni = newSession(for: request.userId)
        guard let response = tokenString(ni) else { record("UWB token unavailable"); return }
        hostAttempts[request.userId] = request.attemptId
        ni.run(NINearbyPeerConfiguration(peerToken: token))
        let current = generation
        record("replying to diner \(request.userId.suffix(6))")
        Task { [weak self] in
            do {
                try await backend.respondTap(partyId: hostedPartyId, userId: request.userId,
                                             hostDeviceId: deviceId, attemptId: request.attemptId, token: response)
                guard let self, self.generation == current,
                      self.hostAttempts[request.userId] == request.attemptId else { return }
                self.record("ranging diner \(request.userId.suffix(6))")
            } catch {
                guard let self, self.generation == current,
                      self.hostAttempts[request.userId] == request.attemptId else { return }
                self.record("token reply failed: \(error.localizedDescription)")
                self.hostAttempts[request.userId] = nil
            }
        }
    }
    private func receive(_ response: TapSession?, for partyId: String) {
        guard !isHost, phases[partyId] != nil, let response,
              response.attemptId == dinerAttempts[partyId] else { return }
        if let reason = response.rejection { rejectTable(partyId, reason: reason); return }
        guard let encoded = response.hostToken, let token = peerToken(encoded),
              let ni = niSessions[partyId], ni.configuration == nil else { return }
        hostTokens[partyId] = encoded
        if let focusedPartyId, focusedPartyId != partyId {
            releaseSession(for: partyId)
            phases[partyId] = .tokenReady
            publishTables()
            return
        }
        if capacityLimited && focusedPartyId == nil {
            releaseSession(for: partyId)
            phases[partyId] = .capacity
            publishTables()
            return
        }
        ni.run(NINearbyPeerConfiguration(peerToken: token))
        phases[partyId] = .ranging
        record("UWB ranging ready for \(partyId.suffix(6))")
        publishTables()
        waitForFirstDistance(from: partyId, attempt: response.attemptId)
    }
    private func waitForFirstDistance(from partyId: String, attempt: String) {
        let current = generation
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(12))
            guard let self, self.generation == current, self.dinerAttempts[partyId] == attempt,
                  self.phases[partyId] == .ranging, self.state != .tapped else { return }
            self.record(self.rangingUpdates.contains(partyId)
                ? "UWB distance unavailable for \(partyId.suffix(6)); retrying"
                : "no UWB updates for \(partyId.suffix(6)); retrying")
            self.announce(to: partyId)
        }
    }
    private func rejectTable(_ partyId: String, reason: String) {
        guard phases[partyId] != nil else { return }
        phases[partyId] = .rejected
        releaseSession(for: partyId)
        record("table \(partyId.suffix(6)) rejected: \(reason)")
        publishTables()
        if nearbyTables.count == 1 { state = .rejected(reason); onRejected?(reason) }
    }
    private func publishTables() {
        nearbyTables = phases.keys.sorted().map {
            NearbyTable(partyId: $0, phase: phases[$0]!, distance: debugDistances[$0])
        }
        guard !isHost, state != .idle, state != .tapped else { return }
        if nearbyTables.contains(where: { $0.phase == .measuring }) {
            state = .connected
        } else if nearbyTables.contains(where: { $0.phase == .exchanging || $0.phase == .tokenReady || $0.phase == .ranging || $0.phase == .capacity }) {
            state = .preparing
        } else if nearbyTables.allSatisfy({ $0.phase == .rejected }), !nearbyTables.isEmpty {
            state = .rejected("Nearby tables are unavailable")
        } else {
            state = .searching
        }
    }
    private func distanceUpdate(_ distance: Float?, for key: String) {
        debugDistances[key] = distance
        if distance != nil {
            hasDistance.insert(key)
            lastDistanceAt[key] = Date()
        } else {
            hasDistance.remove(key)
            lastDistanceAt[key] = nil
        }
        if !isHost, phases[key] != nil {
            phases[key] = distance == nil ? .ranging : .measuring
            publishTables()
        }
        guard var detector = detectors[key] else { return }
        let fired = detector.feed(distance)
        detectors[key] = detector
        debugTapCounts[key] = detector.count
        guard fired else { return }
        if isHost {
            onTap?(key)
        } else {
            tappedPartyId = key
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            state = .tapped
            for other in niSessions.keys.filter({ $0 != key }) { releaseSession(for: other) }
            onTapped?()
        }
    }
}

extension Proximity: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        let id = ObjectIdentifier(advertiser)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.advertiser.map(ObjectIdentifier.init) == id else { return }
            self.record("advertising failed: \(error.localizedDescription)")
        }
    }
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                    withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        invitationHandler(false, nil)
    }
}

extension Proximity: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        let id = ObjectIdentifier(browser)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.browser.map(ObjectIdentifier.init) == id else { return }
            self.record("discovery failed: \(error.localizedDescription)")
            self.state = .rejected("Nearby discovery failed. Check Local Network access in Settings, then retry.")
            self.onRejected?("Nearby discovery failed. Check Local Network access in Settings, then retry.")
        }
    }
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        let id = ObjectIdentifier(browser)
        guard let partyId = info?["partyId"] else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.browser.map(ObjectIdentifier.init) == id else { return }
            self.foundTable(partyId, from: peerID)
        }
    }
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        let id = ObjectIdentifier(browser)
        DispatchQueue.main.async { [weak self] in
            guard let self, self.browser.map(ObjectIdentifier.init) == id else { return }
            for (partyId, peer) in self.nearbyPeers where peer == peerID {
                self.lostTable(partyId, from: peerID)
            }
        }
    }
}

extension Proximity: NISessionDelegate {
    func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        let id = ObjectIdentifier(session)
        let distance = nearbyObjects.first?.distance
        DispatchQueue.main.async { [weak self] in
            guard let self, let key = self.niSessions.first(where: { ObjectIdentifier($0.value) == id })?.key else { return }
            let firstUpdate = self.rangingUpdates.insert(key).inserted
            if firstUpdate && distance == nil {
                self.record("UWB update has no distance for \(key.suffix(6))")
            }
            self.distanceUpdate(distance, for: key)
        }
    }
    func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
        let id = ObjectIdentifier(session)
        DispatchQueue.main.async { [weak self] in
            guard let self, let key = self.niSessions.first(where: { ObjectIdentifier($0.value) == id })?.key else { return }
            self.record("UWB peer removed for \(key.suffix(6)): \(reason)")
            self.distanceUpdate(nil, for: key)
        }
    }
    func sessionWasSuspended(_ session: NISession) {
        let id = ObjectIdentifier(session)
        DispatchQueue.main.async { [weak self] in
            guard let self, let key = self.niSessions.first(where: { ObjectIdentifier($0.value) == id })?.key else { return }
            self.record("UWB session suspended for \(key.suffix(6))")
        }
    }
    func sessionSuspensionEnded(_ session: NISession) {
        if let config = session.configuration { session.run(config) }
    }
    func session(_ session: NISession, didInvalidateWith error: Error) {
        let id = ObjectIdentifier(session)
        DispatchQueue.main.async { [weak self] in
            guard let self, let key = self.niSessions.first(where: { ObjectIdentifier($0.value) == id })?.key else { return }
            self.releaseSession(for: key)
            let nsError = error as NSError
            if nsError.domain == NIErrorDomain && nsError.code == NIError.Code.userDidNotAllow.rawValue {
                if self.isHost {
                    self.record("Nearby Interaction access denied on restaurant phone")
                    self.reject(userId: key, reason: "Restaurant phone needs Nearby Interaction access")
                } else {
                    self.rejectTable(key, reason: "Enable Nearby Interactions for TappyTabs in Settings")
                }
                return
            }
            if nsError.domain == NIErrorDomain && nsError.code == NIError.Code.activeSessionsLimitExceeded.rawValue {
                if self.isHost {
                    self.record("UWB capacity reached for diner \(key.suffix(6)); QR available")
                    self.reject(userId: key, reason: "Restaurant phone is busy; scan QR or retry")
                } else {
                    self.capacityLimited = true
                    self.phases[key] = .capacity
                    self.record("UWB capacity reached; choose nearby table \(key.suffix(6))")
                    self.publishTables()
                }
                return
            }
            self.record("UWB session ended for \(key.suffix(6)): \(error.localizedDescription)")
            if !self.isHost, self.phases[key] != nil, self.state != .tapped {
                let current = self.generation
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(2))
                    guard let self, self.generation == current, self.phases[key] != nil else { return }
                    self.announce(to: key)
                }
            }
        }
    }
}
