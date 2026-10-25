// Owner: Role 2 (mode, ids, hand-off), Role 1 (backend wiring). App-wide state, persisted in UserDefaults.
import Foundation
import Observation

@Observable
final class AppModel {
    enum Mode: String { case diner, restaurant }
    enum BackendKind: String, CaseIterable, Identifiable { case mock, live; var id: String { rawValue } }

    var mode: Mode? { didSet { defaults.set(mode?.rawValue, forKey: Keys.mode) } }
    /// Stable per install. Debug menu can set "demo-diner-1…4" / "demo-restaurant" to use seeded profiles.
    var deviceId: String {
        didSet {
            defaults.set(deviceId, forKey: Keys.deviceId)
            if deviceId != oldValue {
                userId = nil
                partyId = nil
                tapAttemptID = UUID()
            }
        }
    }
    /// Set by onboarding (Role 2) → read by the diner screens (Role 1).
    var userId: String? { didSet { defaults.set(userId, forKey: Keys.userId) } }
    /// Diner: the party joined by tap-in. Restaurant: the party this phone hosts.
    var partyId: String? { didSet { defaults.set(partyId, forKey: Keys.partyId) } }
    /// Changes when the debug menu restarts an in-progress diner tap-in.
    var tapAttemptID = UUID()
    var tapAnimationInProgress = false
    var tapSearchPaused = false
    var backendKind: BackendKind { didSet { defaults.set(backendKind.rawValue, forKey: Keys.backend); rebuild() } }
    var convexURL: String { didSet { defaults.set(convexURL, forKey: Keys.convexURL); rebuild() } }

    private(set) var backend: Backend
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        mode = defaults.string(forKey: Keys.mode).flatMap(Mode.init)
        let device = defaults.string(forKey: Keys.deviceId) ?? UUID().uuidString
        deviceId = device
        userId = defaults.string(forKey: Keys.userId)
        partyId = defaults.string(forKey: Keys.partyId)
        let kind = defaults.string(forKey: Keys.backend).flatMap(BackendKind.init) ?? .mock
        backendKind = kind
        let url = defaults.string(forKey: Keys.convexURL) ?? Env.devURL
        convexURL = url
        backend = AppModel.makeBackend(kind, url)
        defaults.set(device, forKey: Keys.deviceId)
    }

    private static func makeBackend(_ kind: BackendKind, _ url: String) -> Backend {
        kind == .live ? LiveBackend(deploymentUrl: url) : MockBackend()
    }

    private func rebuild() {
        backend = Self.makeBackend(backendKind, convexURL)
        userId = nil
        partyId = nil
        tapAttemptID = UUID()
    }

    var mock: MockBackend? { backend as? MockBackend }

    func leaveTable() {
        tapAnimationInProgress = false
        tapSearchPaused = false
        partyId = nil
        tapAttemptID = UUID()
    }

    func leaveJoinedTable() async throws {
        guard let partyId, let userId else { leaveTable(); return }
        tapSearchPaused = true
        do {
            try await backend.leave(partyId: partyId, userId: userId, deviceId: deviceId)
        } catch {
            tapSearchPaused = false
            throw error
        }
        self.partyId = nil
        tapAttemptID = UUID()
    }

    func resumeTapSearch() {
        tapSearchPaused = false
        tapAttemptID = UUID()
    }

    /// Long-press the logo: back to mode select, keeping the profile.
    func switchMode() { tapAnimationInProgress = false; mode = nil; partyId = nil }

    func signOut() { userId = nil; partyId = nil }
}
