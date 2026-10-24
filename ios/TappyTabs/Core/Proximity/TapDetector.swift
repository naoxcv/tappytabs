// Owner: Role 2. PURE tap logic (unit-tested). Tune TapConfig on the real demo phones with the debug overlay.
import Foundation

struct TapConfig: Equatable {
    var thresholdMetres: Float = 0.15
    var consecutive = 3
    var debounce: TimeInterval = 5
}

/// Fires once when distance < threshold for `consecutive` updates in a row, then ignores this peer for `debounce` s.
/// nil distances (NI lost the peer) reset the count.
struct TapDetector {
    var config = TapConfig()
    private(set) var count = 0
    private(set) var lastFire: Date?
    private(set) var lastDistance: Float?

    mutating func feed(_ distance: Float?, now: Date = Date()) -> Bool {
        lastDistance = distance
        guard let d = distance else { count = 0; return false }
        if let last = lastFire, now.timeIntervalSince(last) < config.debounce { return false }
        count = d < config.thresholdMetres ? count + 1 : 0
        guard count >= config.consecutive else { return false }
        count = 0
        lastFire = now
        return true
    }
}
