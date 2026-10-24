// Owner: Role 1. Shared views. Role 2's restaurant and onboarding screens reuse these; change signatures only with a heads-up.
import SwiftUI
import UIKit

enum Theme {
    static let accent = Color(red: 1, green: 0.96, blue: 0.86)
    static let accentForeground = Color.black
    static let card = Color(.secondarySystemBackground)
    static let restaurantBubble = Color(.tertiarySystemFill)
}

/// Shared Raleway styles that preserve Dynamic Type and the app's existing hierarchy.
enum AppTypography {
    static func custom(
        _ size: CGFloat,
        relativeTo style: Font.TextStyle = .body,
        weight: Font.Weight = .regular
    ) -> Font {
        .custom(postScriptName(for: weight), size: size, relativeTo: style)
    }

    static func style(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        let size: CGFloat
        switch style {
        case .largeTitle: size = 34
        case .title: size = 28
        case .title2: size = 22
        case .title3: size = 20
        case .headline: size = 17
        case .callout: size = 16
        case .subheadline: size = 15
        case .footnote: size = 13
        case .caption: size = 12
        case .caption2: size = 11
        default: size = 17
        }
        return custom(size, relativeTo: style, weight: weight)
    }

    private static func postScriptName(for weight: Font.Weight) -> String {
        if weight == .black { return "RalewayRoman-Black" }
        if weight == .heavy { return "RalewayRoman-ExtraBold" }
        if weight == .bold { return "RalewayRoman-Bold" }
        if weight == .semibold { return "RalewayRoman-SemiBold" }
        if weight == .medium { return "RalewayRoman-Medium" }
        if weight == .light { return "RalewayRoman-Light" }
        if weight == .ultraLight { return "RalewayRoman-ExtraLight" }
        if weight == .thin { return "Raleway-Thin" }
        return "RalewayRoman-Regular"
    }

    static let largeTitle = custom(34, relativeTo: .largeTitle)
    static let title = custom(28, relativeTo: .title)
    static let title2 = custom(22, relativeTo: .title2)
    static let title3 = custom(20, relativeTo: .title3)
    static let headline = custom(17, relativeTo: .headline, weight: .semibold)
    static let body = custom(17, relativeTo: .body)
    static let callout = custom(16, relativeTo: .callout)
    static let subheadline = custom(15, relativeTo: .subheadline)
    static let footnote = custom(13, relativeTo: .footnote)
    static let caption = custom(12, relativeTo: .caption)
    static let caption2 = custom(11, relativeTo: .caption2)
}

enum Speaker: Equatable {
    case diner(avatarId: String, name: String)
    case restaurant
}

/// Rounded bubble, max 260 pt. Shows typing dots for 0.6 s on first appearance, then springs the text in.
struct SpeechBubble: View {
    let text: String
    let speaker: Speaker
    var tail: Edge = .bottom
    @State private var revealed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if case .diner(_, let name) = speaker {
                Text(name).font(AppTypography.style(.caption, weight: .bold)).foregroundStyle(.secondary)
            }
            if revealed {
                Text(text).font(AppTypography.custom(15)).transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                TypingDots()
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .frame(maxWidth: 260, alignment: .leading)
        .background(fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .task {
            try? await Task.sleep(for: .milliseconds(600))
            withAnimation(.spring(duration: 0.35)) { revealed = true }
        }
    }

    private var fill: Color {
        switch speaker {
        case .restaurant: Theme.restaurantBubble
        case .diner(let avatarId, _): AvatarCatalog.color(avatarId).opacity(0.22)
        }
    }
}

struct TypingDots: View {
    @State private var phase = 0.0
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle().frame(width: 6, height: 6).opacity(0.3 + 0.7 * abs(sin(phase + Double(i) * 0.6)))
            }
        }
        .foregroundStyle(.secondary)
        .frame(height: 18)
        .onAppear { withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) { phase = .pi } }
    }
}

enum Money {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        return f
    }()
    static func format(cents: Double) -> String { formatter.string(from: NSNumber(value: cents / 100)) ?? "$\(cents / 100)" }
}

struct PriceText: View {
    let cents: Double
    var body: some View { Text(Money.format(cents: cents)).monospacedDigit() }
}

struct AskServerBadge: View {
    var body: some View {
        Label("Ask your server", systemImage: "exclamationmark.bubble")
            .font(AppTypography.style(.caption2, weight: .bold))
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(Color.yellow.opacity(0.3), in: Capsule())
    }
}

struct ToastView: View {
    let text: String
    var body: some View {
        Text(text)
            .font(AppTypography.style(.subheadline, weight: .medium))
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.ultraThinMaterial, in: Capsule())
            .shadow(radius: 4)
    }
}

/// Shows `store.lastError` as a toast for 3 s, and a "Reconnecting…" banner while subscriptions are down.
struct StoreFeedback: ViewModifier {
    @Bindable var store: PartyStore
    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if store.reconnecting {
                    Text("Reconnecting…").font(AppTypography.style(.caption, weight: .bold)).padding(6).frame(maxWidth: .infinity).background(.yellow.opacity(0.85))
                }
            }
            .overlay(alignment: .bottom) {
                if let e = store.lastError {
                    ToastView(text: e.userMessage)
                        .padding(.bottom, 24)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .task(id: e.message) {
                            try? await Task.sleep(for: .seconds(3))
                            withAnimation { store.lastError = nil }
                        }
                }
            }
            .animation(.spring, value: store.lastError)
    }
}

extension View {
    func storeFeedback(_ store: PartyStore) -> some View { modifier(StoreFeedback(store: store)) }
}

struct BigButtonStyle: ButtonStyle {
    var tint: Color = Theme.accent
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.headline)
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(tint.opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(Theme.accentForeground)
    }
}

/// "Waiting for the table" style row of member avatars with ticks.
struct MemberTicks: View {
    let members: [Member]
    let done: (Member) -> Bool
    var body: some View {
        HStack(spacing: 14) {
            ForEach(members) { m in
                VStack(spacing: 4) {
                    AvatarView(avatarId: m.avatarId, size: 44)
                        .overlay(alignment: .bottomTrailing) {
                            if done(m) { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).background(Circle().fill(.background)) }
                        }
                    Text(m.name).font(AppTypography.caption)
                }
            }
        }
    }
}
