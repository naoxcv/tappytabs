// Owner: Role 1. Three big buttons. A second tap changes the choice while status is still `hunger`.
import SwiftUI

struct HungerView: View {
    let store: PartyStore
    @State private var sending: Hunger?

    var body: some View {
        VStack(spacing: 18) {
            Text("How hungry are you?")
                .font(AppTypography.style(.largeTitle, weight: .bold))
                .padding(.top, 32)
            Text("Choose the portion that feels right.")
                .font(AppTypography.subheadline)
                .foregroundStyle(Theme.accent.opacity(0.72))
            Spacer()
            ForEach(Hunger.allCases) { hunger in
                let isSelected = sending == hunger || store.me?.hunger == hunger
                Button {
                    sending = hunger
                    Task { await store.setHunger(hunger); sending = nil }
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(hunger.label).font(AppTypography.custom(22, weight: .bold))
                            Text(hunger.detail)
                                .font(AppTypography.style(.subheadline))
                                .foregroundStyle(Theme.accent.opacity(0.72))
                        }
                        Spacer(minLength: 0)
                        HungerPlatePortion(hunger: hunger, avatarId: store.me?.avatarId)
                            .frame(width: 176, height: 98)
                            .accessibilityHidden(true)
                        if sending == hunger {
                            ProgressView().tint(Theme.accent)
                        } else if store.me?.hunger == hunger {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(Theme.accent)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous)
                            .strokeBorder(isSelected ? Theme.accent : .clear, lineWidth: 2)
                    }
                    .contentShape(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(sending != nil)
                .animation(.spring(duration: 0.3, bounce: 0.18), value: isSelected)
            }
            Spacer()
        }
        .padding()
    }
}

private struct HungerPlatePortion: View {
    let hunger: Hunger
    let avatarId: String?

    var body: some View {
        ZStack {
            Image("HungerPlate")
                .resizable()
                .scaledToFit()

            switch hunger {
            case .snack:
                agent(size: 60, rotation: -5)
                    .offset(y: -10)
            case .normal:
                HStack(spacing: -13) {
                    agent(size: 48, rotation: -10)
                    agent(size: 52, rotation: 3)
                    agent(size: 47, rotation: 11)
                }
                .offset(y: -10)
            case .starving:
                VStack(spacing: -21) {
                    agent(size: 37, rotation: 7)
                    HStack(spacing: -13) {
                        agent(size: 43, rotation: -11)
                        agent(size: 41, rotation: 9)
                    }
                    HStack(spacing: -17) {
                        agent(size: 48, rotation: 10)
                        agent(size: 46, rotation: -7)
                        agent(size: 48, rotation: 5)
                    }
                }
                .offset(y: -17)
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.2), value: hunger)
    }

    private func agent(size: CGFloat, rotation: Double) -> some View {
        Group {
            if let avatarId {
                AvatarView(avatarId: avatarId, size: size, animated: false)
                    .rotationEffect(.degrees(rotation))
            }
        }
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
