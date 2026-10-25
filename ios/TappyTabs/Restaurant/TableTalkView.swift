// Owner: Role 2. The star of the demo: restaurant avatar top centre, diners on a semicircle; each bubble appears above
// its speaker when showAt passes (same server-offset clock as the diner phones); older bubbles fade into a history strip.
// When status becomes `pick`, PlanSummaryCard slides up.
import SwiftUI

struct TableTalkView: View {
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    let store: PartyStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
            let visible = store.visibleBubbles(at: ctx.date)
            let current = visible.last
            if verticalSizeClass == .compact {
                landscapeConversation(current: current, visible: visible)
            } else {
            GeometryReader { geo in
                ZStack {
                    // Restaurant agent
                    VStack(spacing: 6) {
                        if let current, current.fromUserId == nil {
                            SpeechBubble(text: current.text, speaker: .restaurant).id(current.id)
                        }
                        AvatarView(avatarId: AvatarCatalog.restaurant, size: 70, highlighted: current?.fromUserId == nil && current != nil, state: store.lastError != nil ? .confused : store.party?.status == .negotiating ? .thinking : .idle)
                    }
                    .position(x: geo.size.width / 2, y: geo.size.height * 0.2)

                    // Diners on a semicircle
                    let members = store.party?.members ?? []
                    ForEach(Array(members.enumerated()), id: \.element.id) { i, m in
                        let p = Self.seat(i, of: members.count, in: geo.size)
                        VStack(spacing: 6) {
                            if let current, current.fromUserId == m.userId {
                                SpeechBubble(text: current.text, speaker: .diner(avatarId: m.avatarId, name: m.name)).id(current.id)
                            }
                            AvatarView(avatarId: m.avatarId, size: 64, highlighted: current?.fromUserId == m.userId, state: store.lastError != nil ? .confused : store.party?.status == .negotiating ? .thinking : .idle)
                            Text(m.name).font(AppTypography.style(.caption, weight: .bold))
                        }
                        .position(p)
                    }
                }
            }
            .overlay(alignment: .bottom) {
                VStack(spacing: 8) {
                    HistoryStrip(bubbles: Array(visible.dropLast().suffix(3)), store: store)
                    if store.party?.status == .pick {
                        PlanSummaryCard(store: store).transition(.move(edge: .bottom))
                    }
                }
                .animation(.spring, value: store.party?.status)
            }
            }
        }
    }

    /// Keep the active bubble and plan beside the table on a short landscape screen.
    private func landscapeConversation(current: Bubble?, visible: [Bubble]) -> some View {
        HStack(spacing: 24) {
            VStack(spacing: 8) {
                AvatarView(avatarId: AvatarCatalog.restaurant, size: 64,
                           highlighted: current != nil && current?.fromUserId == nil, state: agentState)
                Text("Restaurant").font(AppTypography.style(.caption, weight: .bold))
                Spacer(minLength: 8)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                    ForEach(store.party?.members ?? []) { member in
                        VStack(spacing: 0) {
                            AvatarView(avatarId: member.avatarId, size: 56,
                                       highlighted: current?.fromUserId == member.userId, state: agentState)
                            Text(member.name).font(AppTypography.style(.caption, weight: .bold)).lineLimit(1)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let current {
                        let speaker: Speaker = current.fromUserId.map {
                            .diner(avatarId: store.avatar(of: $0) ?? "avatar_1", name: store.name(of: $0))
                        } ?? .restaurant
                        SpeechBubble(text: current.text, speaker: speaker).id(current.id)
                    } else {
                        Text("Your agents are getting ready…").foregroundStyle(Theme.accent)
                    }
                    HistoryStrip(bubbles: Array(visible.dropLast().suffix(3)), store: store)
                    if store.party?.status == .pick { PlanSummaryCard(store: store) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity)
        }
        .padding()
    }

    private var agentState: AgentAvatarState {
        store.lastError != nil ? .confused : store.party?.status == .negotiating ? .thinking : .idle
    }

    /// Seat positions on a lower semicircle, 2–6 diners.
    static func seat(_ i: Int, of n: Int, in size: CGSize) -> CGPoint {
        let center = CGPoint(x: size.width / 2, y: size.height * 0.30)
        let r = min(size.width * 0.36, size.height * 0.35)
        let start = Double.pi * 0.95, end = Double.pi * 0.05
        let t = n <= 1 ? 0.5 : Double(i) / Double(n - 1)
        let angle = start + (end - start) * t
        return CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle) + 60)
    }
}

struct HistoryStrip: View {
    let bubbles: [Bubble]
    let store: PartyStore
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(bubbles) { b in
                Text("\(b.fromUserId.map { store.name(of: $0) } ?? "Host"): \(b.text)")
                    .font(AppTypography.caption).lineLimit(1).foregroundStyle(Theme.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
    }
}

/// Each diner's suggested main (from bubbles' plan) and the shared dishes with sharer avatars.
struct PlanSummaryCard: View {
    let store: PartyStore
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The plan").font(AppTypography.headline)
            ForEach(store.sharedLines) { line in
                HStack {
                    Text("For the table: \(line.name)")
                    Spacer()
                    HStack(spacing: -8) { ForEach(line.sharedBy, id: \.self) { AvatarView(avatarId: store.avatar(of: $0) ?? "avatar_1", size: 24) } }
                }
            }
            if let p = store.party {
                Text("\(p.members.filter(\.picked).count) of \(p.members.count) picked their main").font(AppTypography.subheadline).foregroundStyle(Theme.accent)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding()
    }
}
