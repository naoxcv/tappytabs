// Owner: Role 2. Live restaurant conversation: animated agents and an updating chat log.
import SwiftUI

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
                    // The indicator sits at the avatar's upper-right, so its tail points back toward it.
                    SpeakingIndicator(tailOnRight: false)
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
    let tailOnRight: Bool
    var body: some View {
        let color = tailOnRight ? Theme.accent : Color(red: 0.23, green: 0.23, blue: 0.25)
        Text("…")
            .font(.system(size: 22, weight: .bold, design: .rounded))
            .foregroundStyle(tailOnRight ? Theme.background : .white)
            .frame(width: 56, height: 42)
            .offset(y: -4)
            .background(ChatBubbleBackground(tailOnRight: tailOnRight, color: color))
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
    private var isRestaurant: Bool { message.fromUserId == nil }
    private var speakerName: String {
        message.fromUserId.map { store.name(of: $0) } ?? (store.party?.restaurantName ?? "Restaurant")
    }
    private var timestamp: String {
        Date(timeIntervalSince1970: message.showAt / 1000).formatted(date: .omitted, time: .shortened)
    }
    private var bubbleColor: Color {
        isRestaurant ? Theme.accent : Color(red: 0.23, green: 0.23, blue: 0.25)
    }

    var body: some View {
        HStack {
            if isRestaurant { Spacer(minLength: 12) }
            VStack(alignment: isRestaurant ? .trailing : .leading, spacing: 4) {
                Text(speakerName)
                    .font(AppTypography.style(.caption2, weight: .semibold))
                    .foregroundStyle(Theme.accent.opacity(0.72))
                Text(message.text)
                    .font(AppTypography.style(.caption))
                    .foregroundStyle(isRestaurant ? Theme.background : .white)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 10)
                    .background(ChatBubbleBackground(tailOnRight: isRestaurant, color: bubbleColor))
                    .frame(maxWidth: maxBubbleWidth, alignment: isRestaurant ? .trailing : .leading)
                Text(timestamp)
                    .font(AppTypography.style(.caption2))
                    .foregroundStyle(Theme.accent.opacity(0.48))
            }
            if !isRestaurant { Spacer(minLength: 12) }
        }
        .frame(maxWidth: .infinity, alignment: isRestaurant ? .trailing : .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Draw the body and tail as filled overlapping shapes so their join stays opaque.
private struct ChatBubbleBackground: View {
    var tailOnRight: Bool
    var color: Color

    var body: some View {
        GeometryReader { geometry in
            let tailHeight = min(28, max(11, geometry.size.height * 0.24))
            let tailWidth = min(geometry.size.width * 0.5, max(34, geometry.size.width * 0.17))
            let bodyHeight = max(1, geometry.size.height - tailHeight * 0.68)
            ZStack(alignment: tailOnRight ? .bottomTrailing : .bottomLeading) {
                RoundedRectangle(cornerRadius: bodyHeight / 2, style: .continuous)
                    .fill(color)
                    .padding(.bottom, tailHeight * 0.68)
                ChatBubbleTail(tailOnRight: tailOnRight)
                    .fill(color)
                    .frame(width: tailWidth, height: tailHeight)
                    .offset(x: tailOnRight ? tailWidth * 0.12 : -tailWidth * 0.12, y: 0)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
    }
}

private struct ChatBubbleTail: Shape {
    var tailOnRight: Bool

    func path(in rect: CGRect) -> Path {
        func x(_ value: CGFloat) -> CGFloat { tailOnRight ? rect.maxX - value : rect.minX + value }
        var path = Path()
        // Keep the attachment broad along the bubble, then taper to a narrow rounded tip.
        path.move(to: CGPoint(x: x(rect.width * 0.94), y: rect.minY))
        path.addCurve(to: CGPoint(x: x(rect.width * 0.12), y: rect.height * 0.62),
                      control1: CGPoint(x: x(rect.width * 0.65), y: rect.height * 0.02),
                      control2: CGPoint(x: x(rect.width * 0.24), y: rect.height * 0.22))
        path.addCurve(to: CGPoint(x: x(rect.width * 0.07), y: rect.height * 0.88),
                      control1: CGPoint(x: x(rect.width * 0.01), y: rect.height * 0.74),
                      control2: CGPoint(x: x(rect.width * 0.01), y: rect.height * 0.87))
        path.addCurve(to: CGPoint(x: x(rect.width * 0.22), y: rect.height * 0.98),
                      control1: CGPoint(x: x(rect.width * 0.07), y: rect.height * 0.98),
                      control2: CGPoint(x: x(rect.width * 0.16), y: rect.height * 0.98))
        path.addCurve(to: CGPoint(x: x(rect.width * 0.46), y: rect.height * 0.62),
                      control1: CGPoint(x: x(rect.width * 0.31), y: rect.height * 0.91),
                      control2: CGPoint(x: x(rect.width * 0.39), y: rect.height * 0.74))
        path.addCurve(to: CGPoint(x: x(rect.width * 0.94), y: rect.minY),
                      control1: CGPoint(x: x(rect.width * 0.62), y: rect.height * 0.38),
                      control2: CGPoint(x: x(rect.width * 0.83), y: rect.height * 0.10))
        path.closeSubpath()
        return path
    }
}
