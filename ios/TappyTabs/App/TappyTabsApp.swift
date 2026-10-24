// Owner: Role 2. App entry: mode select → diner or restaurant flow. Handles tappytabs://join/<code>.
import SwiftUI

@main
struct TappyTabsApp: App {
    @State private var app = AppModel()
    @State private var pendingJoinCode: String?

    var body: some Scene {
        WindowGroup {
            RootView(pendingJoinCode: $pendingJoinCode)
                .environment(app)
                .onOpenURL { url in pendingJoinCode = JoinLink.joinCode(from: url) }
                .tint(Theme.accent)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Binding var pendingJoinCode: String?

    var body: some View {
        switch app.mode {
        case nil: ModeSelectView()
        case .diner: DinerFlow(pendingJoinCode: $pendingJoinCode)
        case .restaurant: RestaurantFlow()
        }
    }
}

/// Logo used on every top-level screen. Long-press 2 s → mode select. Triple-tap → UWB debug overlay.
struct LogoHeader: View {
    @Environment(AppModel.self) private var app
    @AppStorage("tt.debugOverlay") private var debugOverlay = false
    @State private var showDebugMenu = false

    var body: some View {
        HStack {
            Text("TappyTabs").font(.title3.weight(.heavy)).foregroundStyle(Theme.accent)
                .onTapGesture(count: 3) { debugOverlay.toggle() }
                .onLongPressGesture(minimumDuration: 2) { app.switchMode() }
            Spacer()
            Button { showDebugMenu = true } label: { Image(systemName: "ladybug") }
                .accessibilityLabel("Debug menu")
        }
        .padding(.horizontal)
        .sheet(isPresented: $showDebugMenu) { DebugMenu() }
    }
}

/// Owner: Role 1 + Role 2. Everything needed to build and demo without the other roles.
struct DebugMenu: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                Section("Backend") {
                    Picker("Data", selection: $app.backendKind) {
                        ForEach(AppModel.BackendKind.allCases) { Text($0.rawValue.capitalized).tag($0) }
                    }.pickerStyle(.segmented)
                    TextField("Convex URL", text: $app.convexURL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    HStack {
                        Button("Dev") { app.convexURL = Env.devURL }
                        Spacer()
                        Button("Demo") { app.convexURL = Env.demoURL }
                    }
                }
                Section("Identity (seeded demo profiles)") {
                    LabeledContent("deviceId", value: app.deviceId)
                    LabeledContent("userId", value: app.userId ?? "–")
                    ForEach(1...4, id: \.self) { n in
                        Button("Be demo diner \(n)") { app.deviceId = "demo-diner-\(n)"; Task { await adoptSeededUser() } }
                    }
                    Button("Be the demo restaurant") { app.deviceId = "demo-restaurant" }
                    Button("Sign out (re-run onboarding)", role: .destructive) { app.signOut() }
                }
                if let mock = app.mock {
                    Section("Mock: jump to status") {
                        ForEach(PartyStatus.allCases, id: \.self) { s in
                            Button(s.rawValue) {
                                if app.partyId == nil { app.partyId = mock.ids.partyId }
                                if app.mode == .diner, app.userId == nil { app.userId = mock.ids.userIds[0] }
                                mock.jump(to: s)
                                dismiss()
                            }
                        }
                        Button("Simulate a tap (restaurant)") { mock.simulateTap() }
                    }
                }
                Section {
                    Button("Leave table") { app.partyId = nil }
                    Button("Switch mode") { app.switchMode(); dismiss() }
                }
            }
            .navigationTitle("Debug")
            .toolbar { Button("Done") { dismiss() } }
        }
    }

    private func adoptSeededUser() async {
        if let me = try? await app.backend.me(deviceId: app.deviceId) { app.userId = me._id }
    }
}
