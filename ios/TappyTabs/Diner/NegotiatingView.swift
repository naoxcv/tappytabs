// Owner: Role 1. Your avatar + your own agent's latest revealed bubble. No controls.
import SwiftUI

struct NegotiatingView: View {
    let store: PartyStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
            let mine = store.visibleBubbles(at: ctx.date).last { $0.fromUserId == store.userId }
            VStack(spacing: 24) {
                Spacer()
                if let mine, let me = store.me {
                    SpeechBubble(text: mine.text, speaker: .diner(avatarId: me.avatarId, name: "Your agent")).id(mine.id)
                }
                AvatarView(avatarId: store.me?.avatarId ?? "avatar_1", size: 120, highlighted: true, state: store.lastError == nil ? .thinking : .confused)
                Text("Your agent is negotiating…").font(AppTypography.style(.title2, weight: .bold))
                Text("Watch the restaurant screen!").foregroundStyle(Theme.accent)
                Spacer()
            }
            .padding()
        }
    }
}
