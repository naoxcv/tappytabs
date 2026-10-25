// Owner: Role 2. Live restaurant conversation: animated agents and an updating chat log.
import SwiftUI

struct TableTalkView: View {
    let store: PartyStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let messages = store.visibleBubbles(at: context.date).sorted {
                $0.showAt == $1.showAt ? $0.id < $1.id : $0.showAt < $1.showAt
            }
            let speaking = Self.activeBubble(
                in: messages,
                serverNowMs: context.date.ms + store.serverOffsetMs,
                status: store.party?.status
            )
            GeometryReader { geometry in
                let contentWidth = max(0, geometry.size.width - 1)
                HStack(spacing: 0) {
                    AgentPlayArea(store: store, current: speaking)
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

    static func activeBubble(in messages: [Bubble], serverNowMs: Double, status: PartyStatus?) -> Bubble? {
        guard status == .negotiating, let latest = messages.last else { return nil }
        let durationMs = max(1_800, 1_200 + Double(latest.text.trimmingCharacters(in: .whitespacesAndNewlines).count) * 15)
        return serverNowMs < latest.showAt + durationMs ? latest : nil
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
                Text(message.text)
                    .font(AppTypography.style(.caption))
                    .foregroundStyle(Theme.background)
                    .multilineTextAlignment(isRestaurant ? .trailing : .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: max(72, maxBubbleWidth - bubbleStyle.horizontalPadding * 2), alignment: isRestaurant ? .trailing : .leading)
                    .padding(.horizontal, bubbleStyle.horizontalPadding)
                    .padding(.top, bubbleStyle.verticalPadding)
                    .padding(.bottom, bubbleStyle.verticalPadding + bubbleStyle.tailClearance)
                    .background(ChatBubbleBackground(tailOnRight: isRestaurant, style: bubbleStyle))
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

/// Uses the SVG bubble asset directly. Cap insets protect the original corners and tail as the center stretches.
private struct ChatBubbleBackground: View {
    var tailOnRight: Bool
    var style: ChatBubbleStyle = .standard

    var body: some View {
        GeometryReader { geometry in
            Image("MessageBubble")
                .resizable(capInsets: style.capInsets, resizingMode: .stretch)
                .frame(width: geometry.size.width, height: geometry.size.height)
                .scaleEffect(x: tailOnRight ? -1 : 1, y: 1)
        }
        .accessibilityHidden(true)
    }
}

/// Text insets and the SVG's stretch regions can be tuned here. Edit the SVG to change the tail silhouette.
private struct ChatBubbleStyle {
    static let standard = ChatBubbleStyle(
        capInsets: EdgeInsets(top: 28, leading: 34, bottom: 28, trailing: 29),
        horizontalPadding: 18,
        verticalPadding: 14,
        tailClearance: 14
    )
    var capInsets: EdgeInsets
    var horizontalPadding: CGFloat = 18
    var verticalPadding: CGFloat = 14
    var tailClearance: CGFloat
}
