// Owner: Role 2. Tap-to-join over MultipeerConnectivity (discovery + token swap) and NearbyInteraction (UWB ranging).
// Restaurant: advertises the party, ranges every diner (one NISession per peer), reports taps → calls parties:join.
// Diner: browses, auto-invites the first restaurant, ranges it, buzzes on a tap (no network wait).
// Requires: both apps foregrounded, UWB iPhones (11+, not SE/16e), Local Network + Nearby Interaction permission.
import Foundation
import MultipeerConnectivity
import NearbyInteraction
import Observation
import UIKit

/// The one message type sent over Multipeer.
enum Envelope: Codable {
    case hello(userId: String?, token: Data)   // userId nil from the restaurant
    case rejected(reason: String)
}

@Observable
final class Proximity: NSObject {
    static let shared = Proximity()
    static let serviceType = "tappytabs" // ↔ Info.plist NSBonjourServices _tappytabs._tcp/_udp

    enum State: Equatable { case idle, searching, connected, tapped, rejected(String) }

    private(set) var state: State = .idle
    /// userId (or "restaurant") → metres, for the debug overlay.
    private(set) var debugDistances: [String: Float] = [:]
    private(set) var debugTapCounts: [String: Int] = [:]
    var config = TapConfig()

    var supportsTap: Bool {
        if #available(iOS 16.0, *) { return NISession.deviceCapabilities.supportsPreciseDistanceMeasurement }
        return NISession.isSupported
    }

    // Multipeer
    @ObservationIgnored private var peer: MCPeerID?
    @ObservationIgnored private var session: MCSession?
    @ObservationIgnored private var advertiser: MCNearbyServiceAdvertiser?
    @ObservationIgnored private var browser: MCNearbyServiceBrowser?

    // NI: one session per remote peer
    @ObservationIgnored private var niSessions: [MCPeerID: NISession] = [:]
    @ObservationIgnored private var peerUserIds: [MCPeerID: String] = [:]
    @ObservationIgnored private var detectors: [MCPeerID: TapDetector] = [:]

    // Callbacks
    @ObservationIgnored private var isHost = false
    @ObservationIgnored private var myUserId: String?
    @ObservationIgnored private var onConnected: ((String) -> Void)?
    @ObservationIgnored private var onTapped: (() -> Void)?
    @ObservationIgnored private var onRejected: ((String) -> Void)?
    @ObservationIgnored private var onTap: ((String) -> Void)?

    // MARK: public API (contract with Role 1 / restaurant screens)

    func startDinerTapIn(userId: String, onConnected: @escaping (_ partyId: String) -> Void,
                         onTapped: @escaping () -> Void, onRejected: @escaping (_ reason: String) -> Void) {
        stop()
        isHost = false
        myUserId = userId
        self.onConnected = onConnected
        self.onTapped = onTapped
        self.onRejected = onRejected
        let peer = MCPeerID(displayName: "diner-\(userId.suffix(6))")
        setUpSession(peer)
        let browser = MCNearbyServiceBrowser(peer: peer, serviceType: Self.serviceType)
        browser.delegate = self
        browser.startBrowsingForPeers()
        self.browser = browser
        state = .searching
    }

    func startHosting(partyId: String, onTap: @escaping (_ userId: String) -> Void) {
        stop()
        isHost = true
        self.onTap = onTap
        let peer = MCPeerID(displayName: "restaurant")
        setUpSession(peer)
        let advertiser = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["partyId": partyId], serviceType: Self.serviceType)
        advertiser.delegate = self
        advertiser.startAdvertisingPeer()
        self.advertiser = advertiser
        state = .searching
    }

    /// Restaurant → diner, e.g. "Table is full".
    func reject(userId: String, reason: String) {
        guard let peerID = peerUserIds.first(where: { $0.value == userId })?.key else { return }
        send(.rejected(reason: reason), to: [peerID])
    }

    func stop() {
        advertiser?.stopAdvertisingPeer(); advertiser = nil
        browser?.stopBrowsingForPeers(); browser = nil
        session?.disconnect(); session = nil
        niSessions.values.forEach { $0.invalidate() }
        niSessions = [:]; peerUserIds = [:]; detectors = [:]
        debugDistances = [:]; debugTapCounts = [:]
        state = .idle
    }

    // MARK: internals

    private func setUpSession(_ peer: MCPeerID) {
        self.peer = peer
        let s = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .optional)
        s.delegate = self
        session = s
    }

    private func send(_ envelope: Envelope, to peers: [MCPeerID]) {
        guard let session, let data = try? JSONEncoder().encode(envelope) else { return }
        try? session.send(data, toPeers: peers, with: .reliable)
    }

    /// Fresh NISession per connection (discovery tokens are single-session). Sends our token in a hello.
    private func startRanging(with peerID: MCPeerID) {
        let ni = NISession()
        ni.delegate = self
        niSessions[peerID] = ni
        var detector = TapDetector()
        detector.config = config
        detectors[peerID] = detector
        guard let token = ni.discoveryToken,
              let data = try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true) else { return }
        send(.hello(userId: isHost ? nil : myUserId, token: data), to: [peerID])
    }

    private func handle(_ envelope: Envelope, from peerID: MCPeerID) {
        switch envelope {
        case .hello(let userId, let tokenData):
            if let userId { peerUserIds[peerID] = userId }
            guard let token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NIDiscoveryToken.self, from: tokenData),
                  let ni = niSessions[peerID] else { return }
            ni.run(NINearbyPeerConfiguration(peerToken: token))
        case .rejected(let reason):
            state = .rejected(reason)
            onRejected?(reason)
        }
    }

    private func peerID(for ni: NISession) -> MCPeerID? { niSessions.first { $0.value === ni }?.key }

    private func distanceUpdate(_ distance: Float?, peerID: MCPeerID) {
        let key = isHost ? (peerUserIds[peerID] ?? peerID.displayName) : "restaurant"
        debugDistances[key] = distance
        guard var detector = detectors[peerID] else { return }
        let fired = detector.feed(distance)
        detectors[peerID] = detector
        debugTapCounts[key] = detector.count
        guard fired else { return }
        if isHost {
            if let userId = peerUserIds[peerID] { onTap?(userId) }
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            state = .tapped
            onTapped?()
        }
    }
}

extension Proximity: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async { [self] in
            switch state {
            case .connected:
                if !isHost { self.state = .connected }
                startRanging(with: peerID)
            case .notConnected:
                niSessions[peerID]?.invalidate()
                niSessions[peerID] = nil; detectors[peerID] = nil
                if !isHost, self.state != .tapped { self.state = .searching }
            default: break
            }
        }
    }
    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        guard let env = try? JSONDecoder().decode(Envelope.self, from: data) else { return }
        DispatchQueue.main.async { self.handle(env, from: peerID) }
    }
    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

extension Proximity: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID,
                    withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        invitationHandler(true, session) // auto-accept, no UI
    }
}

extension Proximity: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        guard let partyId = info?["partyId"], let session else { return }
        DispatchQueue.main.async { [self] in
            onConnected?(partyId)
            browser.invitePeer(peerID, to: session, withContext: nil, timeout: 10)
            browser.stopBrowsingForPeers() // first restaurant wins
        }
    }
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {}
}

extension Proximity: NISessionDelegate {
    func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        let d = nearbyObjects.first?.distance
        DispatchQueue.main.async { [self] in
            if let peerID = peerID(for: session) { distanceUpdate(d, peerID: peerID) }
        }
    }
    func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
        DispatchQueue.main.async { [self] in
            if let peerID = peerID(for: session) { distanceUpdate(nil, peerID: peerID) }
        }
    }
    func sessionWasSuspended(_ session: NISession) {}
    func sessionSuspensionEnded(_ session: NISession) {
        if let config = session.configuration { session.run(config) }
    }
    func session(_ session: NISession, didInvalidateWith error: Error) {
        // Tokens are single-session: drop it; the Multipeer reconnect path redoes the token swap.
        DispatchQueue.main.async { [self] in
            if let peerID = peerID(for: session) { niSessions[peerID] = nil }
        }
    }
}
