// Owner: Role 2. First launch: "Diner or Restaurant", saved in tt.mode. Long-press the logo to come back.
import SwiftUI

struct ModeSelectView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("TappyTabs").font(.system(size: 44, weight: .heavy)).foregroundStyle(Theme.accent)
            Text("Tap in. Let your agents order.").foregroundStyle(.secondary)
            Spacer()
            Button { app.mode = .diner } label: { Label("I'm a diner", systemImage: "person.fill") }
                .buttonStyle(BigButtonStyle())
            Button { app.mode = .restaurant } label: { Label("This is the restaurant phone", systemImage: "fork.knife") }
                .buttonStyle(BigButtonStyle(tint: .indigo))
            Text(app.backendKind == .mock ? "Using mock data (Debug menu → Live)" : "Live: \(app.convexURL)")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
    }
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
