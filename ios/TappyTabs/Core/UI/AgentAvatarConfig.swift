import SwiftUI

/// Presentation-only mapping. Keep stored avatar IDs compatible with the backend.
enum AvatarCatalog {
    static let characters = ["tomato", "mushroom", "bokchoy", "garlic", "cat"]
    static let ids = (1...5).map { "avatar_\($0)" }
    static let restaurant = "restaurant"
    static let overrides = ["restaurant": "cat"]

    static func character(_ id: String) -> String {
        if let name = overrides[id] { return name }
        if characters.contains(id) { return id }
        if id.hasPrefix("avatar_"), let n = Int(id.dropFirst(7)), n > 0 {
            return characters[(n - 1) % characters.count]
        }
        // Stable across launches, unlike Swift's randomized hashValue.
        let hash = id.utf8.reduce(UInt64(5381)) { ($0 &* 33) &+ UInt64($1) }
        return characters[Int(hash % UInt64(characters.count))]
    }

    static func color(_ id: String) -> Color {
        switch character(id) {
        case "tomato": return Color(red: 0.69, green: 0.24, blue: 0.24)
        case "mushroom": return Color(red: 0.65, green: 0.48, blue: 0.37)
        case "bokchoy": return Color(red: 0.35, green: 0.58, blue: 0.36)
        case "garlic": return Color(red: 0.65, green: 0.51, blue: 0.70)
        default: return Color(red: 0.85, green: 0.58, blue: 0.30)
        }
    }
}

/// Values ported directly from the demo's P object.
struct AgentPersonality {
    let br, bs, sw: Double
    let hi: ClosedRange<Double>
    let hh, sq: Double
    let bk: ClosedRange<Double>
    let db: Double
    let gl: ClosedRange<Double>
    let er, ln: Double

    static let all: [String: AgentPersonality] = [
        "tomato": .init(br: 0.012, bs: 2.2, sw: 1.2, hi: 2...4.5, hh: 120, sq: 0.16, bk: 2...4.5, db: 0.2, gl: 1.5...3.5, er: 16, ln: 4),
        "mushroom": .init(br: 0.008, bs: 1.1, sw: 0.5, hi: 7...13, hh: 60, sq: 0.08, bk: 3.5...7, db: 0.05, gl: 3...6, er: 12, ln: 2.5),
        "bokchoy": .init(br: 0.01, bs: 1.4, sw: 3, hi: 5...9, hh: 80, sq: 0.1, bk: 2.5...5.5, db: 0.1, gl: 2...4.5, er: 14, ln: 3),
        "garlic": .init(br: 0.01, bs: 1.8, sw: 1.6, hi: 4...8, hh: 90, sq: 0.12, bk: 1.5...4, db: 0.4, gl: 0.8...2, er: 18, ln: 3.5),
        "cat": .init(br: 0.011, bs: 1.7, sw: 2.2, hi: 3.5...7, hh: 85, sq: 0.13, bk: 1.8...4.5, db: 0.3, gl: 0.9...2.4, er: 15, ln: 3.5)
    ]
}
