// Owner: Role 1. One Decodable per query result. Field names are IDENTICAL to Role 4's return shapes
// (see the JSON fixtures in Core/Mocks, exported from the real backend). All ids are String.
// All numbers decode as Double: Convex numbers are float64. When SENDING numbers, also send Double
// (a Swift Int is encoded as a Convex int64, which v.number() rejects).
import Foundation

enum PartyStatus: String, Codable, CaseIterable {
    case checkin, hunger, negotiating, pick, confirm, placed
}

enum Hunger: String, Codable, CaseIterable, Identifiable {
    case snack, normal, starving
    var id: String { rawValue }
    var label: String { ["snack": "Snack", "normal": "Normal", "starving": "Starving"][rawValue]! }
    var emoji: String { ["snack": "🥨", "normal": "🍜", "starving": "🍖"][rawValue]! }
}

enum Allergen: String, Codable, CaseIterable, Identifiable {
    case milk, egg, fish, shellfish, tree_nut, peanut, wheat, soy, sesame, gluten
    var id: String { rawValue }
    var label: String {
        switch self {
        case .milk: "Dairy"; case .egg: "Eggs"; case .fish: "Fish"; case .shellfish: "Shellfish"
        case .tree_nut: "Tree nuts"; case .peanut: "Peanuts"; case .wheat: "Wheat"; case .soy: "Soy"
        case .sesame: "Sesame"; case .gluten: "Gluten"
        }
    }
}

enum Diet: String, Codable, CaseIterable, Identifiable {
    case vegetarian, vegan, halal, no_pork
    var id: String { rawValue }
    var label: String { ["vegetarian": "Vegetarian", "vegan": "Vegan", "halal": "Halal", "no_pork": "No pork"][rawValue]! }
}

enum Personality: String, Codable {
    case adventurous, picky, budget_minded
    var label: String { ["adventurous": "Adventurous", "picky": "Picky", "budget_minded": "Budget-minded"][rawValue]! }
}

/// parties:current
struct Party: Decodable, Equatable {
    let id: String
    let restaurantName: String
    let status: PartyStatus
    let size: Double
    let joinCode: String
    let pickDeadline: Double?
    let confirmDeadline: Double?
    let members: [Member]

    func member(_ userId: String?) -> Member? { members.first { $0.userId == userId } }
}

struct Member: Decodable, Equatable, Identifiable {
    let userId: String
    let name: String
    let avatarId: String
    let hunger: Hunger?
    let picked: Bool
    let confirmed: Bool
    var id: String { userId }
}

/// messages:list
struct MessagesPayload: Decodable, Equatable {
    let serverNow: Double
    let messages: [Bubble]
}

struct Bubble: Decodable, Equatable, Identifiable {
    let id: String
    let fromUserId: String?   // nil = the restaurant agent
    let text: String
    let showAt: Double        // ms since epoch, server clock
}

/// orders:candidates
struct Candidate: Decodable, Equatable, Identifiable {
    let itemId: String
    let name: String
    let description: String
    let priceCents: Double
    let reason: String
    let rank: Double          // 1 = agent's top pick; drink = 0
    let isDrink: Bool
    let askServer: Bool
    var id: String { itemId }
}

/// orders:lines
struct LinesPayload: Decodable, Equatable {
    let lines: [Line]
    let totals: Totals
    static let empty = LinesPayload(lines: [], totals: Totals(perUser: [:], total: 0))
}

struct Line: Decodable, Equatable, Identifiable {
    let lineId: String
    let itemId: String
    let name: String
    let qty: Double
    let priceCents: Double
    let kind: String          // main | drink | shared | extra
    let sharedBy: [String]
    let addedBy: String       // a userId or "agent"
    let askServer: Bool
    var id: String { lineId }
    var isShared: Bool { sharedBy.count > 1 }
}

struct Totals: Decodable, Equatable {
    let perUser: [String: Double]
    let total: Double
}

/// orders:addable
struct AddableItem: Decodable, Equatable, Identifiable {
    let itemId: String
    let name: String
    let category: String
    let priceCents: Double
    let isDrink: Bool
    let askServer: Bool
    var id: String { itemId }
}

/// orders:remove
struct RemoveResult: Decodable, Equatable {
    struct Substitute: Decodable, Equatable {
        let itemId: String
        let name: String
        let priceCents: Double
        let reason: String
        let askServer: Bool
    }
    let substitute: Substitute?
}

/// menu:status
struct MenuStatus: Decodable, Equatable {
    let name: String
    let source: String        // "seed" | "apify"
    let fetchedAt: Double?
    let itemCount: Double
}

struct RestaurantRef: Decodable, Equatable, Identifiable {
    let id: String
    let name: String
}

struct IngestResult: Decodable, Equatable {
    let count: Double
    let source: String
    let apifyRunId: String?
    let note: String
}

struct CreatedParty: Decodable, Equatable {
    let partyId: String
    let joinCode: String
}

struct JoinResult: Decodable, Equatable {
    let result: String        // "joined" | "already"
    let partyId: String
}

struct HostedParty: Decodable, Equatable {
    let partyId: String
    let status: PartyStatus
}

/// users:me (subset the app uses)
struct UserProfile: Decodable, Equatable {
    let _id: String
    let name: String
    let avatarId: String
    let allergies: [Allergen]
    let diet: [Diet]
    let personality: Personality?
    let profileSummary: String?
}

struct FollowUpQuestion: Decodable, Equatable, Identifiable {
    let id: String
    let question: String
    let options: [String]
}

struct FollowUpAnswer: Equatable {
    let id: String
    let question: String
    let answer: String
}

struct ProfileSummary: Decodable, Equatable {
    let profileSummary: String
    let personality: Personality
}

/// Everything onboarding collects before users:upsert.
struct DraftProfile: Equatable {
    var name = ""
    var allergies: Set<Allergen> = []
    var diet: Set<Diet> = []
    var spice: Double = 2
    var likes: [String] = []
    var dislikes: [String] = []
    var cuisines: [String] = []
    var dislikedCuisines: [String] = []
    var likedCategories: [String] = []
    var avatarId = "avatar_1"
}

enum JoinVia: String { case uwb, qr, sim }
