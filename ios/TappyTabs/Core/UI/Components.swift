// Owner: Role 1. Shared views. Role 2's restaurant and onboarding screens reuse these; change signatures only with a heads-up.
import SwiftUI
import UIKit

enum Theme {
    static let background = Color("AppBackground")
    static let accent = Color(red: 1, green: 0.96, blue: 0.86)
    static let accentForeground = background
    static let primaryActionFill = accent
    static let primaryActionText = background
    static let secondaryActionText = accent
    static let cardCornerRadius: CGFloat = 16
    static let card = Color(.secondarySystemBackground)
    static let restaurantBubble = Color(.tertiarySystemFill)
}

/// A restrained transition for replacing a full-screen flow page. The small
/// horizontal movement gives the user a sense of progress without making the
/// app feel like it is pushing a long navigation stack.
enum AppPageTransition {
    static func transition(direction: CGFloat = 1, reduceMotion: Bool) -> AnyTransition {
        guard !reduceMotion else { return .opacity }
        let travel: CGFloat = 22 * direction
        return .asymmetric(
            insertion: .offset(x: travel).combined(with: .opacity),
            removal: .offset(x: -travel).combined(with: .opacity)
        )
    }

    static func animation(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: 0.15) : .easeInOut(duration: 0.32)
    }
}

/// Shared typography that preserves Dynamic Type and the app's existing hierarchy.
enum AppTypography {
    static func custom(
        _ size: CGFloat,
        relativeTo style: Font.TextStyle = .body,
        weight: Font.Weight = .regular
    ) -> Font {
        .custom(postScriptName(for: weight, style: style), size: size, relativeTo: style).weight(weight)
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

    static func postScriptName(for weight: Font.Weight, style: Font.TextStyle) -> String {
        switch style {
        case .largeTitle, .title, .title2, .title3, .headline: break
        default:
            if weight == .black || weight == .heavy { return "OpenSansRoman-ExtraBold" }
            if weight == .bold { return "OpenSansRoman-Bold" }
            if weight == .semibold { return "OpenSansRoman-SemiBold" }
            if weight == .light || weight == .ultraLight || weight == .thin { return "OpenSansRoman-Light" }
            return "OpenSans-Regular"
        }
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
                Text(name).font(AppTypography.style(.caption, weight: .bold)).foregroundStyle(Theme.accent)
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
        .foregroundStyle(Theme.accent)
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
                    Text("Reconnecting…").font(AppTypography.style(.caption, weight: .bold)).padding(6).frame(maxWidth: .infinity)
                        .foregroundStyle(Theme.accentForeground).background(Theme.accent)
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
    var tint: Color = Theme.primaryActionFill
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.style(.body, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 54)
            .background(tint.opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: 16))
            .foregroundStyle(Theme.primaryActionText)
            .contentShape(RoundedRectangle(cornerRadius: 16))
            .opacity(isEnabled ? 1 : 0.48)
    }
}

struct CompactPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.style(.subheadline, weight: .semibold))
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Theme.primaryActionFill.opacity(configuration.isPressed ? 0.7 : 1),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(Theme.primaryActionText)
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(isEnabled ? 1 : 0.48)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.style(.body, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(Theme.secondaryActionText.opacity(configuration.isPressed ? 0.7 : 1))
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Theme.secondaryActionText.opacity(configuration.isPressed ? 0.9 : 0.42), lineWidth: 1)
            }
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(isEnabled ? 1 : 0.48)
    }
}

struct AppTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AppTypography.body)
            .foregroundStyle(Theme.accent)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.accent.opacity(0.24), lineWidth: 1)
            }
    }
}

extension View {
    func appFieldStyle() -> some View { textFieldStyle(AppTextFieldStyle()) }
}

/// "Waiting for the table" style row of member avatars with ticks.
struct MemberTicks: View {
    let members: [Member]
    let done: (Member) -> Bool
    var avatarSize: CGFloat = 44

    var body: some View {
        Group {
            if avatarSize >= 60 {
                let rows = centeredRows
                VStack(spacing: 14) {
                    ForEach(rows.indices, id: \.self) { rowIndex in
                        HStack(spacing: 12) {
                            ForEach(rows[rowIndex]) { member in
                                memberTick(member)
                                    .transition(.asymmetric(
                                        insertion: .offset(x: avatarSize).combined(with: .scale(scale: 0.82)).combined(with: .opacity),
                                        removal: .opacity
                                    ))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
                .animation(.spring(response: 0.5, dampingFraction: 0.62), value: members.map(\.userId))
            } else {
                HStack(spacing: 14) {
                    ForEach(members) { member in memberTick(member) }
                }
            }
        }
    }

    private var centeredRows: [[Member]] {
        stride(from: 0, to: members.count, by: 4).map { start in
            Array(members[start..<min(start + 4, members.count)])
        }
    }

    private func memberTick(_ member: Member) -> some View {
        VStack(spacing: 4) {
            Text(member.name)
                .font(AppTypography.caption)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            AvatarView(avatarId: member.avatarId, size: avatarSize)
                .overlay(alignment: .bottomTrailing) {
                    if done(member) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .background(Circle().fill(.background))
                    }
                }
        }
        .frame(width: avatarSize >= 60 ? avatarSize + 12 : nil)
    }
}
