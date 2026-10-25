// Owner: Role 2. App entry: mode select → diner or restaurant flow. Handles tappytabs://join/<code>.
import SwiftUI
import UIKit

@main
struct TappyTabsApp: App {
    @UIApplicationDelegateAdaptor(OrientationDelegate.self) private var orientationDelegate
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var app = AppModel()
    @State private var pendingJoinCode: String?
    @State private var showingLaunch = true

    init() {
        guard let titleFont = UIFont(name: "RalewayRoman-Regular", size: 17),
              let largeTitleFont = UIFont(name: "RalewayRoman-Bold", size: 34) else { return }
        let appearance = UINavigationBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(Theme.background)
        appearance.titleTextAttributes[.font] = titleFont
        appearance.largeTitleTextAttributes[.font] = largeTitleFont
        appearance.titleTextAttributes[.foregroundColor] = UIColor(Theme.accent)
        appearance.largeTitleTextAttributes[.foregroundColor] = UIColor(Theme.accent)
        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
        UISegmentedControl.appearance().selectedSegmentTintColor = UIColor(Theme.accent)
        UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor(Theme.accent)], for: .normal)
        UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor(Theme.accentForeground)], for: .selected)
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                Group {
                    if app.mode == nil {
                        ModeSelectView(isLaunching: showingLaunch)
                            .transition(AppPageTransition.transition(reduceMotion: reduceMotion))
                    } else {
                        RootView(pendingJoinCode: $pendingJoinCode)
                    }
                }
                .opacity(showingLaunch && app.mode != nil ? 0 : 1)
                .animation(reduceMotion ? .easeOut(duration: 0.15) : .easeInOut(duration: 0.6), value: showingLaunch)
                .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: app.mode)

                if showingLaunch && app.mode != nil {
                    LaunchBrandView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Theme.background.ignoresSafeArea())
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.background.ignoresSafeArea())
                .scrollContentBackground(.hidden)
                .preferredColorScheme(.dark)
                .foregroundStyle(Theme.accent, Theme.accent, Theme.accent)
                .environment(app)
                .onOpenURL { url in pendingJoinCode = JoinLink.joinCode(from: url) }
                .allowsHitTesting(!showingLaunch)
                .tint(Theme.accent)
                .task {
                    guard showingLaunch else { return }
                    do {
                        try await Task.sleep(for: .seconds(1.2))
                    } catch {
                        return
                    }
                    finishLaunch()
                }
                .onChange(of: app.mode, initial: true) { _, mode in
                    OrientationDelegate.update(for: mode)
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { OrientationDelegate.update(for: app.mode) }
                }
        }
    }

    private func finishLaunch() {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .easeInOut(duration: 0.6)) {
            showingLaunch = false
        }
    }
}

/// UI-only orientation policy; persisted restaurant mode also launches in landscape.
final class OrientationDelegate: NSObject, UIApplicationDelegate {
    static var supported: UIInterfaceOrientationMask = mask(
        for: UserDefaults.standard.string(forKey: Keys.mode).flatMap(AppModel.Mode.init(rawValue:))
    )

    static func mask(for mode: AppModel.Mode?) -> UIInterfaceOrientationMask {
        mode == .restaurant ? .landscape : .portrait
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        Self.supported
    }

    static func update(for mode: AppModel.Mode?) {
        supported = mask(for: mode)
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            where scene.activationState == .foregroundActive {
            for window in scene.windows {
                var controller = window.rootViewController
                while let current = controller {
                    current.setNeedsUpdateOfSupportedInterfaceOrientations()
                    controller = current.presentedViewController
                }
            }
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: supported))
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var pendingJoinCode: String?

    var body: some View {
        Group {
            switch app.mode {
            case nil: ModeSelectView()
            case .diner: DinerFlow(pendingJoinCode: $pendingJoinCode)
            case .restaurant: RestaurantFlow()
            }
        }
        .id(app.mode?.rawValue ?? "mode-select")
        .transition(AppPageTransition.transition(reduceMotion: reduceMotion))
        .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: app.mode)
        .font(AppTypography.body)
    }
}

/// Top-left shortcut area: long-press 2 s → mode select. Triple-tap → UWB debug overlay.
struct LogoHeader: View {
    @Environment(AppModel.self) private var app
    @AppStorage("tt.debugOverlay") private var debugOverlay = false
    @State private var showDebugMenu = false

    var body: some View {
        HStack {
            Color.clear
                .frame(width: 120, height: 44)
                .contentShape(Rectangle())
                .onTapGesture(count: 3) { debugOverlay.toggle() }
                .onLongPressGesture(minimumDuration: 2) { app.switchMode() }
            Spacer()
            Button { showDebugMenu = true } label: { Image(systemName: "ladybug") }
                .accessibilityLabel("Debug menu")
        }
        .padding(.horizontal)
        .sheet(isPresented: $showDebugMenu) {
            DebugMenu()
                .presentationBackground(Theme.background)
        }
    }
}

/// Owner: Role 1 + Role 2. Everything needed to build and demo without the other roles.
struct DebugMenu: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var selectingDiner: Int?
    @State private var identityMessage: String?
    @State private var identityRequestID = UUID()
    @State private var leavingTable = false
    @State private var leaveError: String?
    @State private var creatingTestProfile = false
    @State private var testProfileError: String?
    @State private var showingRestaurantResetConfirmation = false

    var body: some View {
        @Bindable var app = app
        NavigationStack {
            Form {
                if app.mode == .diner && app.partyId == nil {
                    Section(header: Text("Tap test").font(AppTypography.headline)) {
                        if app.userId == nil {
                            Button(creatingTestProfile ? "Creating test diner…" : "Skip onboarding for tap test") {
                                Task { await createTestProfile() }
                            }
                            .disabled(creatingTestProfile || selectingDiner != nil)
                            if let testProfileError { Text(testProfileError).foregroundStyle(Theme.accent) }
                        }
                        Button("Restart tap search") {
                            app.leaveTable()
                            dismiss()
                        }
                    }
                }
                Section(header: Text("Backend").font(AppTypography.headline)) {
                    Picker("Data", selection: $app.backendKind) {
                        ForEach(AppModel.BackendKind.allCases) { Text($0.rawValue.capitalized).tag($0) }
                    }.pickerStyle(.segmented)
                    TextField("Convex URL", text: $app.convexURL, prompt: Text("Convex URL").foregroundStyle(Theme.accent))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    HStack {
                        Button("Dev") { app.convexURL = Env.devURL }
                        Spacer()
                        Button("Demo") { app.convexURL = Env.demoURL }
                    }
                }
                Section(header: Text("Test identities").font(AppTypography.headline)) {
                    LabeledContent("deviceId", value: app.deviceId)
                    LabeledContent("userId", value: app.userId ?? "–")
                    ForEach(1...4, id: \.self) { n in
                        Button("Skip onboarding · diner \(n)") { selectDemoDiner(n) }
                            .disabled(selectingDiner != nil || creatingTestProfile)
                    }
                    if let selectingDiner { ProgressView("Loading demo diner \(selectingDiner)…") }
                    if let identityMessage { Text(identityMessage).font(AppTypography.footnote) }
                    Button("Be the demo restaurant") {
                        identityRequestID = UUID()
                        selectingDiner = nil
                        identityMessage = nil
                        app.deviceId = "demo-restaurant"
                        app.userId = nil
                        app.leaveTable()
                    }
                    Button("Sign out (re-run onboarding)", role: .destructive) { app.signOut() }
                        .foregroundStyle(Theme.accent)
                }
                if app.mode == .restaurant {
                    Section(header: Text("Restaurant onboarding").font(AppTypography.headline)) {
                        Button("Reset restaurant identity", role: .destructive) {
                            showingRestaurantResetConfirmation = true
                        }
                        Text("Creates a fresh restaurant account on the next screen. The previous restaurant and menu stay stored in Convex.")
                            .font(AppTypography.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                if let mock = app.mock {
                    Section(header: Text("Mock: jump to status").font(AppTypography.headline)) {
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
                    Button("Leave table") {
                        Task { await leaveJoinedTable() }
                    }.disabled(leavingTable)
                    if leavingTable { ProgressView("Leaving table…") }
                    if let leaveError { Text(leaveError).foregroundStyle(Theme.accent).font(AppTypography.footnote) }
                    Button("Switch mode") { app.switchMode(); dismiss() }
                }
            }
            .navigationTitle("Debug")
            .toolbar { Button("Done") { dismiss() } }
            .confirmationDialog("Reset this restaurant identity?", isPresented: $showingRestaurantResetConfirmation, titleVisibility: .visible) {
                Button("Reset restaurant", role: .destructive) {
                    app.deviceId = UUID().uuidString
                    app.userId = nil
                    app.leaveTable()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This starts a fresh restaurant onboarding flow. Existing backend restaurant data is not deleted.")
            }
        }
    }

    @MainActor private func createTestProfile() async {
        guard !creatingTestProfile else { return }
        creatingTestProfile = true
        testProfileError = nil
        defer { creatingTestProfile = false }
        let backend = app.backend
        let deviceId = app.deviceId
        do {
            let userId: String
            if let existing = try await backend.me(deviceId: deviceId) {
                userId = existing._id
            } else {
                var draft = DraftProfile()
                draft.name = "Test \(deviceId.prefix(4))"
                userId = try await backend.upsertUser(deviceId: deviceId, profile: draft)
            }
            guard app.backend === backend, app.deviceId == deviceId else { return }
            app.userId = userId
            dismiss()
        } catch {
            guard app.backend === backend, app.deviceId == deviceId else { return }
            testProfileError = TTError.from(error).userMessage
        }
    }

    @MainActor private func leaveJoinedTable() async {
        leavingTable = true
        leaveError = nil
        do {
            try await app.leaveJoinedTable()
            dismiss()
        } catch {
            leaveError = TTError.from(error).userMessage
        }
        leavingTable = false
    }

    @MainActor private func selectDemoDiner(_ n: Int) {
        let selectedDeviceId = "demo-diner-\(n)"
        let requestID = UUID()
        identityRequestID = requestID
        selectingDiner = n
        identityMessage = nil
        app.deviceId = selectedDeviceId
        app.userId = nil
        app.leaveTable()

        if let mock = app.mock {
            app.userId = mock.ids.userIds[n - 1]
            selectingDiner = nil
            dismiss()
            return
        }

        let backend = app.backend
        Task { await adoptSeededUser(n, deviceId: selectedDeviceId, requestID: requestID, backend: backend) }
    }

    @MainActor private func adoptSeededUser(_ n: Int, deviceId: String, requestID: UUID, backend: Backend) async {
        do {
            let me = try await backend.me(deviceId: deviceId)
            guard identityRequestID == requestID, app.deviceId == deviceId, app.backend === backend else { return }
            let userId: String
            if let me { userId = me._id }
            else {
                // A fresh local backend need not be seeded just to test phone-to-phone tap.
                var profile = DraftProfile()
                profile.name = "Test Diner \(n)"
                profile.avatarId = "avatar_\(n)"
                userId = try await backend.upsertUser(deviceId: deviceId, profile: profile)
            }
            guard identityRequestID == requestID, app.deviceId == deviceId, app.backend === backend else { return }
            app.userId = userId
            selectingDiner = nil
            dismiss()
            return
        } catch {
            guard identityRequestID == requestID, app.deviceId == deviceId, app.backend === backend else { return }
            identityMessage = "Could not create test diner \(n): \(TTError.from(error).userMessage)"
        }
        selectingDiner = nil
    }
}
