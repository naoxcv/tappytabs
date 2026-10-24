// Owner: Role 1. Three big buttons. A second tap changes the choice while status is still `hunger`.
import SwiftUI

struct HungerView: View {
    let store: PartyStore
    @State private var sending: Hunger?

    var body: some View {
        VStack(spacing: 18) {
            Text("How hungry are you?").font(.largeTitle.bold()).padding(.top, 32)
            Text("Your agent uses this to size the order.").foregroundStyle(.secondary)
            Spacer()
            ForEach(Hunger.allCases) { h in
                Button {
                    sending = h
                    Task { await store.setHunger(h); sending = nil }
                } label: {
                    HStack {
                        Text(h.emoji).font(.system(size: 40))
                        Text(h.label).font(.title2.bold())
                        Spacer()
                        if sending == h { ProgressView() }
                        if store.me?.hunger == h { Image(systemName: "checkmark.circle.fill") }
                    }
                    .padding(20)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
                }
                .buttonStyle(.plain)
                .disabled(sending != nil)
            }
            Spacer()
        }
        .padding()
    }
}
