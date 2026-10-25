// Owner: Role 2. First launch: "Diner or Restaurant", saved in tt.mode. Long-press the logo to come back.
import SwiftUI

struct ModeSelectView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var isLaunching = false

    var body: some View {
        GeometryReader { geometry in
            let bottomPadding: CGFloat = max(geometry.safeAreaInsets.bottom == 0 ? 24 : 12, 12)
            VStack(spacing: 0) {
                Spacer(minLength: 24)
                LaunchBrandView()
                    .scaleEffect(reduceMotion || !isLaunching ? 1 : 0.9)
                    .offset(y: reduceMotion || !isLaunching ? 0 : (104 + bottomPadding) / 2)
                    .animation(reduceMotion ? nil : .smooth(duration: 0.6), value: isLaunching)
                Spacer(minLength: 40)
                
                VStack(spacing: 10) {
                    Button { app.mode = .diner } label: {
                        Text("I am a diner")
                    }
                    .buttonStyle(BigButtonStyle())

                    Button { app.mode = .restaurant } label: {
                        Text("This is a restaurant device.")
                            .font(AppTypography.custom(18, weight: .regular))
                            .underline()
                            .foregroundStyle(Theme.secondaryActionText)
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 32)
                .padding(.bottom, bottomPadding)
                .opacity(isLaunching ? 0 : 1)
                .offset(y: reduceMotion || !isLaunching ? 0 : 16)
                .animation(reduceMotion ? .easeOut(duration: 0.15) : .easeOut(duration: 0.35).delay(0.25), value: isLaunching)
                .allowsHitTesting(!isLaunching)
                .accessibilityHidden(isLaunching)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
        }
    }
}

struct LaunchBrandView: View {
    var body: some View {
        VStack(spacing: 0) {
            AvatarView(avatarId: AvatarCatalog.restaurant, size: 200, state: .launching)
                .accessibilityHidden(true)
            Text("TappyTabs")
                .font(AppTypography.custom(36, relativeTo: .largeTitle, weight: .black))
                .tracking(-1.2)
                .foregroundStyle(Theme.accent)
                .offset(y: -28)
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
