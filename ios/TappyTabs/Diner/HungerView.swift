// Owner: Role 1. Three big buttons. A second tap changes the choice while status is still `hunger`.
import SwiftUI

struct HungerView: View {
    let store: PartyStore
    @State private var sending: Hunger?

    var body: some View {
        VStack(spacing: 18) {
            Text("How hungry are you?").font(AppTypography.style(.largeTitle, weight: .bold)).padding(.top, 32)
            Spacer()
            ForEach(Hunger.allCases) { h in
                Button {
                    sending = h
                    Task { await store.setHunger(h); sending = nil }
                } label: {
                    HStack {
                        HungerLevelMeter(level: Hunger.allCases.firstIndex(of: h) ?? 0)
                            .frame(width: 42, height: 36)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(h.label).font(AppTypography.custom(22, weight: .bold))
                            Text(h.detail).font(AppTypography.style(.subheadline)).foregroundStyle(Theme.accent.opacity(0.72))
                        }
                        Spacer()
                        if sending == h { ProgressView() }
                        if store.me?.hunger == h { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.accent) }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
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

private struct HungerLevelMeter: View {
    let level: Int
    private let heights: [CGFloat] = [14, 24, 34]

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Capsule()
                    .fill(index <= level ? Theme.accent : Theme.accent.opacity(0.2))
                    .frame(width: 8, height: heights[index])
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

private extension Hunger {
    var detail: String {
        switch self {
        case .snack: "Just a little something"
        case .normal: "Ready for a meal"
        case .starving: "I could eat a lot"
        }
    }
}
