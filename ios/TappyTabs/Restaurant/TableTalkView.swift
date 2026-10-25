// Owner: Role 2. Live restaurant conversation: animated agents and an updating chat log.
import SwiftUI
import UIKit

struct TableTalkView: View {
    let store: PartyStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let messages = store.visibleBubbles(at: context.date).sorted {
                $0.showAt == $1.showAt ? $0.id < $1.id : $0.showAt < $1.showAt
            }
            GeometryReader { geometry in
                let contentWidth = max(0, geometry.size.width - 1)
                HStack(spacing: 0) {
                    AgentPlayArea(store: store, current: messages.last)
                        .frame(width: contentWidth * 2 / 3, height: geometry.size.height)
                    Rectangle().fill(Theme.accent.opacity(0.15)).frame(width: 1)
                    LiveChatLog(store: store, messages: messages)
                        .frame(width: contentWidth / 3, height: geometry.size.height)
                }
            }
            .background(Theme.background.ignoresSafeArea())
        }
        .storeFeedback(store)
    }
}

private struct AgentPlayArea: View {
    let store: PartyStore
    let current: Bubble?
    private var members: [Member] { store.party?.members ?? [] }
    private var agentCount: Int { members.count + 1 }

    var body: some View {
        GeometryReader { geometry in
            let layout = Self.positions(count: agentCount)
            let size = min(geometry.size.width / 4.5,
                           geometry.size.height / CGFloat(max(1, layout.rows)) * 0.82)
            ZStack {
                Color.clear
                agent(AvatarCatalog.restaurant, isSpeaking: current?.fromUserId == nil && current != nil,
                      size: size * 0.94)
                    .position(point(layout.points[0], in: geometry.size))
                ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                    agent(member.avatarId, isSpeaking: current?.fromUserId == member.userId, size: size)
                        .position(point(layout.points[index + 1], in: geometry.size))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipped()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Agents")
    }

    private func agent(_ avatarId: String, isSpeaking: Bool, size: CGFloat) -> some View {
        AvatarView(avatarId: avatarId, size: max(84, size), highlighted: isSpeaking,
                   state: .celebrating, animated: true)
            .overlay(alignment: .topTrailing) {
                if isSpeaking {
                    // A small, tail-free typing pill keeps the speaking cue visually quiet.
                    SpeakingIndicator()
                        .offset(x: 8, y: -2)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.72), value: isSpeaking)
            .accessibilityLabel(isSpeaking ? "Agent speaking" : "Agent")
    }

    private func point(_ point: CGPoint, in size: CGSize) -> CGPoint {
        CGPoint(x: point.x * size.width, y: point.y * size.height)
    }

    private static func positions(count: Int) -> (points: [CGPoint], rows: Int) {
        let rows = max(1, Int(ceil(Double(count) / 3)))
        let points = (0..<count).map { index -> CGPoint in
            let row = index / 3
            let start = row * 3
            let countInRow = min(3, count - start)
            let column = index - start
            let x: CGFloat
            switch countInRow {
            case 1: x = 0.5
            case 2: x = column == 0 ? 0.28 : 0.72
            default: x = [0.18, 0.5, 0.82][column]
            }
            let y: CGFloat = rows == 1 ? 0.5 : 0.23 + 0.54 * CGFloat(row) / CGFloat(rows - 1)
            return CGPoint(x: x, y: y)
        }
        return (points, rows)
    }
}

private struct SpeakingIndicator: View {
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { _ in
                Circle().fill(Theme.background).frame(width: 5, height: 5)
            }
        }
        .frame(width: 42, height: 28)
        .background(Theme.accent, in: Capsule())
        .overlay(alignment: .bottomLeading) {
            Circle().fill(Theme.accent).frame(width: 8, height: 8).offset(x: 2, y: 2)
        }
        .shadow(color: Theme.background.opacity(0.16), radius: 3, y: 1)
        .accessibilityLabel("Speaking")
    }
}

private struct LiveChatLog: View {
    let store: PartyStore
    let messages: [Bubble]

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Chat").font(AppTypography.style(.headline, weight: .bold))
                }
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                Rectangle().fill(Theme.accent.opacity(0.12)).frame(height: 1)

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if messages.isEmpty {
                                Text("The agents are getting ready…")
                                    .font(AppTypography.style(.caption))
                                    .foregroundStyle(Theme.accent.opacity(0.62))
                                    .frame(maxWidth: .infinity, minHeight: 80, alignment: .center)
                            }
                            ForEach(messages) { message in
                                LiveChatRow(message: message, store: store,
                                            maxBubbleWidth: max(110, geometry.size.width - 48))
                                    .id(message.id)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 14)
                    }
                    .onChange(of: messages.last?.id) { _, latest in
                        guard let latest else { return }
                        withAnimation(.easeOut(duration: 0.24)) { proxy.scrollTo(latest, anchor: .bottom) }
                    }
                    .onAppear {
                        if let latest = messages.last?.id { proxy.scrollTo(latest, anchor: .bottom) }
                    }
                }

                if store.party?.status == .pick { compactPlanSummary }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background)
        }
    }

    private var compactPlanSummary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("The plan").font(AppTypography.style(.caption, weight: .bold))
            ForEach(store.sharedLines) { line in
                HStack(spacing: 5) {
                    Text(line.name).lineLimit(1)
                    Spacer(minLength: 3)
                    HStack(spacing: -6) {
                        ForEach(line.sharedBy, id: \.self) { userId in
                            AvatarView(avatarId: store.avatar(of: userId) ?? "avatar_1", size: 18, animated: false)
                        }
                    }
                }
                .font(AppTypography.style(.caption2))
            }
            if let party = store.party {
                Text("\(party.members.filter(\.picked).count) of \(party.members.count) picked")
                    .font(AppTypography.style(.caption2)).foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(Theme.accent)
        .padding(9)
        .background(Theme.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
    }
}

private struct LiveChatRow: View {
    let message: Bubble
    let store: PartyStore
    let maxBubbleWidth: CGFloat
    var bubbleStyle: ChatBubbleStyle = .standard
    private var isRestaurant: Bool { message.fromUserId == nil }
    private var speakerName: String {
        message.fromUserId.map { store.name(of: $0) } ?? (store.party?.restaurantName ?? "Restaurant")
    }
    private var timestamp: String {
        Date(timeIntervalSince1970: message.showAt / 1000).formatted(date: .omitted, time: .shortened)
    }
    var body: some View {
        HStack {
            if isRestaurant { Spacer(minLength: 12) }
            VStack(alignment: isRestaurant ? .trailing : .leading, spacing: 4) {
                Text(speakerName)
                    .font(AppTypography.style(.caption2, weight: .semibold))
                    .foregroundStyle(Theme.accent.opacity(0.72))
                messageBubble
                Text(timestamp)
                    .font(AppTypography.style(.caption2))
                    .foregroundStyle(Theme.accent.opacity(0.48))
            }
            if !isRestaurant { Spacer(minLength: 12) }
        }
        .frame(maxWidth: .infinity, alignment: isRestaurant ? .trailing : .leading)
        .accessibilityElement(children: .combine)
    }

    private var messageBubble: some View {
        Text(message.text)
            .font(AppTypography.style(.caption))
            .foregroundStyle(Theme.background)
            .multilineTextAlignment(isRestaurant ? .trailing : .leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: bubbleWidth - horizontalPadding * 2,
                   alignment: isRestaurant ? .trailing : .leading)
            .padding(.horizontal, horizontalPadding)
            .padding(.top, verticalPadding)
            .padding(.bottom, verticalPadding + tailClearance)
            .frame(width: bubbleWidth, alignment: isRestaurant ? .trailing : .leading)
            .background(ChatBubbleBackground(tailOnRight: isRestaurant))
    }

    private var fontForMeasurement: UIFont {
        let name = AppTypography.postScriptName(for: .regular, style: .caption)
        return UIFont(name: name, size: 12) ?? .systemFont(ofSize: 12)
    }

    private var naturalTextWidth: CGFloat {
        ceil((message.text as NSString).size(withAttributes: [.font: fontForMeasurement]).width) + 4
    }

    private var compactBubble: Bool {
        naturalTextWidth + 24 <= maxBubbleWidth
    }

    private var horizontalPadding: CGFloat { compactBubble ? 12 : bubbleStyle.horizontalPadding }
    private var verticalPadding: CGFloat { compactBubble ? 9 : bubbleStyle.verticalPadding }
    private var tailClearance: CGFloat { compactBubble ? 8 : bubbleStyle.tailClearance }

    private var bubbleWidth: CGFloat {
        let naturalBubbleWidth = naturalTextWidth + horizontalPadding * 2
        return min(maxBubbleWidth, max(bubbleStyle.minimumWidth, naturalBubbleWidth))
    }
}

/// Smooth capsule and round tail matched to the speaking indicator.
private struct ChatBubbleBackground: View {
    var tailOnRight: Bool

    var body: some View {
        SoftChatBubbleShape(tailOnRight: tailOnRight)
            .fill(Theme.accent)
            .accessibilityHidden(true)
    }
}

private struct SoftChatBubbleShape: Shape {
    var tailOnRight: Bool

    func path(in rect: CGRect) -> Path {
        let tailSize = min(16, max(10, rect.height * 0.32))
        let bodyHeight = max(1, rect.height - tailSize * 0.4)
        let radius = bodyHeight / 2
        let bottom = rect.minY + bodyHeight
        let left = rect.minX
        let right = rect.maxX
        let top = rect.minY
        var path = Path()
        path.move(to: CGPoint(x: left + radius, y: top))
        path.addLine(to: CGPoint(x: right - radius, y: top))
        path.addQuadCurve(to: CGPoint(x: right, y: top + radius), control: CGPoint(x: right, y: top))
        path.addLine(to: CGPoint(x: right, y: bottom - radius))
        path.addQuadCurve(to: CGPoint(x: right - radius, y: bottom), control: CGPoint(x: right, y: bottom))

        if tailOnRight {
            path.addLine(to: CGPoint(x: right - radius - tailSize * 0.15, y: bottom))
            path.addCurve(to: CGPoint(x: right - radius + tailSize * 0.25, y: rect.maxY),
                          control1: CGPoint(x: right - radius + tailSize * 0.2, y: bottom + tailSize * 0.4),
                          control2: CGPoint(x: right - radius + tailSize * 0.42, y: rect.maxY))
            path.addCurve(to: CGPoint(x: right - radius - tailSize * 1.15, y: bottom),
                          control1: CGPoint(x: right - radius + tailSize * 0.04, y: rect.maxY),
                          control2: CGPoint(x: right - radius - tailSize * 0.68, y: bottom + tailSize * 0.18))
        } else {
            path.addLine(to: CGPoint(x: left + radius + tailSize * 1.15, y: bottom))
            path.addCurve(to: CGPoint(x: left + radius - tailSize * 0.2, y: rect.maxY),
                          control1: CGPoint(x: left + radius + tailSize * 0.68, y: bottom + tailSize * 0.18),
                          control2: CGPoint(x: left + radius - tailSize * 0.04, y: rect.maxY))
            path.addCurve(to: CGPoint(x: left + radius, y: bottom),
                          control1: CGPoint(x: left + radius - tailSize * 0.42, y: rect.maxY),
                          control2: CGPoint(x: left + radius - tailSize * 0.2, y: bottom + tailSize * 0.4))
        }

        path.addLine(to: CGPoint(x: left + radius, y: bottom))
        path.addQuadCurve(to: CGPoint(x: left, y: bottom - radius), control: CGPoint(x: left, y: bottom))
        path.addLine(to: CGPoint(x: left, y: top + radius))
        path.addQuadCurve(to: CGPoint(x: left + radius, y: top), control: CGPoint(x: left, y: top))
        path.closeSubpath()
        return path
    }
}

/// Text insets and minimum width for restaurant chat bubbles.
private struct ChatBubbleStyle {
    static let standard = ChatBubbleStyle(
        horizontalPadding: 18,
        verticalPadding: 14,
        tailClearance: 14
    )
    var minimumWidth: CGFloat = 64
    var horizontalPadding: CGFloat = 18
    var verticalPadding: CGFloat = 14
    var tailClearance: CGFloat
}
