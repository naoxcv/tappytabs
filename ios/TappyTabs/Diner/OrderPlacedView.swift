// Owner: Role 1. Final summary + "Sent to the restaurant", with a success haptic.
import SwiftUI

struct OrderPlacedView: View {
    @Environment(AppModel.self) private var app
    let store: PartyStore

    var body: some View {
        VStack(spacing: 16) {
            AvatarView(avatarId: store.me?.avatarId ?? "avatar_1", size: 96, state: .happy).padding(.top, 24)
            Text("Sent to the restaurant").font(AppTypography.style(.largeTitle, weight: .bold))
            List {
                Section(header: Text("For the table").font(AppTypography.headline)) { ForEach(store.sharedLines) { LineRow(line: $0, avatars: $0.sharedBy.compactMap { store.avatar(of: $0) }) } }
                Section(header: Text("Yours").font(AppTypography.headline)) { ForEach(store.myLines()) { LineRow(line: $0, avatars: []) } }
                Section {
                    HStack { Text("Your share").bold(); Spacer(); PriceText(cents: store.myShareCents).bold() }
                    HStack { Text("Table total"); Spacer(); PriceText(cents: store.lines.totals.total) }
                }
            }
            Button("Done") { app.partyId = nil }.padding(.bottom)
        }
        .onAppear { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    }
}
