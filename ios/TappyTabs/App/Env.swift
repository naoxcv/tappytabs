// Owner: Role 1. Deployment URLs. The Debug menu can override at runtime (saved in UserDefaults).
enum Env {
    /// Shared demo deployment (Role 4 deploys and maintains).
    static let demoURL = "https://oceanic-canary-660.convex.cloud"
    /// Your own dev deployment, or a local backend on your Mac reachable from the phone:
    /// `npm run dev:local` → http://<your-mac-LAN-ip>:3210 (simulator can use 127.0.0.1).
    static let devURL = "http://127.0.0.1:3210"
}

/// UserDefaults keys (shared contract with Role 2's onboarding/tap-in).
enum Keys {
    static let mode = "tt.mode"
    static let deviceId = "tt.deviceId"
    static let userId = "tt.userId"
    static let partyId = "tt.partyId"
    static let hostPartyId = "tt.hostPartyId"
    static let backend = "tt.backend"
    static let convexURL = "tt.convexURL"
}
