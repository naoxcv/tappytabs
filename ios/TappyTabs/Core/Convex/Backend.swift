// Owner: Role 1. The only seam between screens and data. LiveBackend talks to Convex; MockBackend replays
// fixtures and simulates the party locally, so every screen works with the backend off.
import Combine
import Foundation

protocol Backend: AnyObject {
    // Subscriptions (live-updating)
    func party(_ partyId: String) -> AnyPublisher<Party?, TTError>
    func messages(_ partyId: String) -> AnyPublisher<MessagesPayload, TTError>
    func candidates(_ partyId: String, userId: String) -> AnyPublisher<[Candidate], TTError>
    func lines(_ partyId: String) -> AnyPublisher<LinesPayload, TTError>
    func menuStatus(_ restaurantId: String) -> AnyPublisher<MenuStatus?, TTError>
    func addable(_ partyId: String, userId: String, shared: Bool) -> AnyPublisher<[AddableItem], TTError>
    func pendingTaps(partyId: String, hostDeviceId: String) -> AnyPublisher<[TapRequest], TTError>
    func tapSession(partyId: String, userId: String, deviceId: String) -> AnyPublisher<TapSession?, TTError>

    // One-shot reads
    func me(deviceId: String) async throws -> UserProfile?
    func restaurants() async throws -> [RestaurantRef]
    func hosted(hostDeviceId: String) async throws -> HostedParty?
    func forUser(userId: String) async throws -> HostedParty?

    // Users
    func upsertUser(deviceId: String, profile: DraftProfile) async throws -> String
    func followups(draft: DraftProfile) async throws -> [FollowUpQuestion]
    func summarize(userId: String, answers: [FollowUpAnswer]) async throws -> ProfileSummary

    // Restaurant
    func ingestMenu(restaurantId: String) async throws -> IngestResult
    func createParty(restaurantId: String, size: Int, hostDeviceId: String) async throws -> CreatedParty
    func startWithFewer(partyId: String, hostDeviceId: String) async throws
    func reset(partyId: String, hostDeviceId: String) async throws
    func announceTap(partyId: String, userId: String, deviceId: String, attemptId: String, token: String) async throws
    func respondTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, token: String) async throws
    func rejectTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, reason: String) async throws

    // Join: restaurant phone after a tap (hostDeviceId), or diner after a QR scan (deviceId)
    func join(partyId: String?, joinCode: String?, userId: String, via: JoinVia,
              hostDeviceId: String?, deviceId: String?) async throws -> JoinResult
    func leave(partyId: String, userId: String, deviceId: String) async throws

    // Diner actions (bound to this device)
    func setHunger(partyId: String, userId: String, deviceId: String, hunger: Hunger) async throws
    func pick(partyId: String, userId: String, deviceId: String, itemId: String) async throws
    func add(partyId: String, userId: String, deviceId: String, itemId: String, shared: Bool) async throws
    func remove(partyId: String, userId: String, deviceId: String, lineId: String) async throws -> RemoveResult
    func confirm(partyId: String, userId: String, deviceId: String) async throws
}

struct TapRequest: Decodable, Equatable {
    let userId: String
    let attemptId: String
    let dinerToken: String
}

struct TapSession: Decodable, Equatable {
    let attemptId: String
    let hostToken: String?
    let rejection: String?
}

/// Shared contract error codes (convex/shared/errors.ts). Switch on `code`, never on text.
struct TTError: Error, Equatable, LocalizedError {
    enum Code: String, Decodable {
        case FULL, BAD_STATUS, NOT_MEMBER, NOT_HOST, UNSAFE, NOT_FOUND, INVALID
        case NETWORK, UNKNOWN
    }
    let code: Code
    let message: String
    var reasons: [String] = []

    var errorDescription: String? { userMessage }

    var userMessage: String {
        switch code {
        case .FULL: "This table is full."
        case .UNSAFE: reasons.isEmpty ? message : "\(message): \(reasons.joined(separator: ", "))"
        case .NETWORK: "Reconnecting…"
        default: message
        }
    }

    static func network(_ message: String) -> TTError { TTError(code: .NETWORK, message: message) }
}
