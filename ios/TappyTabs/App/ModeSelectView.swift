// Owner: Role 2. First launch: "Diner or Restaurant", saved in tt.mode. Long-press the logo to come back.
import SwiftUI

struct ModeSelectView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        GeometryReader { geometry in
            VStack(spacing: 0) {
                Spacer(minLength: 24)
                VStack(spacing: 0) {
                    Image("agent_cat")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 200, height: 200)
                        .accessibilityHidden(true)
                    Text("TappyTabs")
                        .font(AppTypography.custom(36, weight: .black))
                        .tracking(-1.2)
                        .foregroundStyle(Theme.accent)
                        .offset(y: -28)
                }
                Spacer(minLength: 40)
                VStack(spacing: 10) {
                    Button { app.mode = .diner } label: {
                        Text("I am a diner")
                            .font(AppTypography.custom(22, weight: .regular))
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 15))
                    }
                    .buttonStyle(.plain)

                    Button { app.mode = .restaurant } label: {
                        Text("This is a restaurant device.")
                            .font(AppTypography.custom(18, weight: .regular))
                            .underline()
                            .foregroundStyle(Theme.accent)
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, max(geometry.safeAreaInsets.bottom == 0 ? 24 : 12, 12))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black.ignoresSafeArea())
        }
    }
}

#Preview("Mode Selection") {
    let defaults = UserDefaults(suiteName: "TappyTabs.ModeSelectPreview")!
    ModeSelectView()
        .environment(AppModel(defaults: defaults))
}

/// Keeps one PartyStore alive per party and resubscribes when the app returns to the foreground.
struct PartyScope<Content: View>: View {
    @Environment(AppModel.self) private var app
    @Environment(\.scenePhase) private var scenePhase
    let partyId: String
    let userId: String?
    @ViewBuilder let content: (PartyStore) -> Content
    @State private var store: PartyStore?

    var body: some View {
        Group {
            if let store { content(store).storeFeedback(store) } else { ProgressView() }
        }
        .task(id: partyId) {
            let s = PartyStore(partyId: partyId, userId: userId, deviceId: app.deviceId, backend: app.backend)
            s.start()
            store = s
        }
        .onChange(of: scenePhase) { _, phase in if phase == .active { store?.start() } }
        .onDisappear { store?.stop() }
    }
}
