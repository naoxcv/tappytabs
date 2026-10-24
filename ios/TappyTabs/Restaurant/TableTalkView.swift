// Owner: Role 2. The star of the demo: restaurant avatar top centre, diners on a semicircle; each bubble appears above
// its speaker when showAt passes (same server-offset clock as the diner phones); older bubbles fade into a history strip.
// When status becomes `pick`, PlanSummaryCard slides up.
import SwiftUI

struct TableTalkView: View {
    let store: PartyStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
            let visible = store.visibleBubbles(at: ctx.date)
            let current = visible.last
            GeometryReader { geo in
                ZStack {
                    // Restaurant agent
                    VStack(spacing: 6) {
                        if let current, current.fromUserId == nil {
                            SpeechBubble(text: current.text, speaker: .restaurant).id(current.id)
                        }
                        AvatarView(avatarId: AvatarCatalog.restaurant, size: 70, highlighted: current?.fromUserId == nil && current != nil)
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
                            AvatarView(avatarId: m.avatarId, size: 64, highlighted: current?.fromUserId == m.userId)
                            Text(m.name).font(.caption.bold())
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
                    .font(.caption).lineLimit(1).foregroundStyle(.secondary)
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
            Text("The plan").font(.headline)
            ForEach(store.sharedLines) { line in
                HStack {
                    Text("For the table: \(line.name)")
                    Spacer()
                    HStack(spacing: -8) { ForEach(line.sharedBy, id: \.self) { AvatarView(avatarId: store.avatar(of: $0) ?? "avatar_1", size: 24) } }
                }
            }
            if let p = store.party {
                Text("\(p.members.filter(\.picked).count) of \(p.members.count) picked their main").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding()
    }
}
