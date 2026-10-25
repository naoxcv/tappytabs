// Owner: Role 2. Restaurant phone: setup → check-in (hosting UWB) → hunger wait → table talk → progress → ticket.
import Combine
import SwiftUI

struct RestaurantFlow: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("tt.debugOverlay") private var debugOverlay = false
    @State private var restaurantReady = false

    var body: some View {
        VStack(spacing: 0) {
            LogoHeader()
            Group {
                if let partyId = app.partyId {
                    PartyScope(partyId: partyId, userId: nil) { store in RestaurantRootView(store: store) }
                } else if app.backendKind == .live && !restaurantReady {
                    RestaurantOnboardingView {
                        restaurantReady = true
                    }
                } else {
                    PartySetupView()
                }
            }
            .id(app.partyId == nil ? (restaurantReady ? "party-setup" : "setup") : "party")
            .transition(AppPageTransition.transition(reduceMotion: reduceMotion))
            .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: app.partyId)
            .frame(maxHeight: .infinity)
        }
        .overlay(alignment: .bottom) { if debugOverlay { ProximityDebugOverlay() } }
        .task {
            // Relaunch: resume the table this phone was hosting.
            guard app.partyId == nil else { return }
            let backend = app.backend
            let deviceId = app.deviceId
            if let hosted = try? await backend.hosted(hostDeviceId: deviceId), hosted.status != .placed,
               app.partyId == nil, app.backend === backend, app.deviceId == deviceId, app.mode == .restaurant {
                app.partyId = hosted.partyId
            }
        }
    }
}

/// First-run live restaurant setup. The persisted Convex onboarding record is the source of truth,
/// so killing the app resumes at the last completed stage.
struct RestaurantOnboardingView: View {
    @Environment(AppModel.self) private var app
    private let onReady: () -> Void
    @State private var name = ""
    @State private var address = ""
    @State private var sourceURL = ""
    @State private var acquisition: Acquisition = .url
    @State private var showSourceEntry = false
    @State private var onboardingId: String?
    @State private var onboarding: RestaurantOnboarding?
    @State private var draft: RestaurantMenuDraft?
    @State private var loading = true
    @State private var saving = false
    @State private var skipping = false
    @State private var error: String?
    @State private var statusSub: AnyCancellable?
    @State private var showingResetConfirmation = false
    @State private var lastDraftLoadKey: String?
    @State private var draftLoadInFlight = false

    private enum Acquisition: Hashable { case url, search }

    init(onReady: @escaping () -> Void = {}) {
        self.onReady = onReady
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Button { app.switchMode() } label: {
                        Label("Back", systemImage: "chevron.left")
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                    Button("Start over") { showingResetConfirmation = true }
                        .buttonStyle(.bordered)
                }
                Text("Set up your restaurant").font(AppTypography.style(.largeTitle, weight: .bold))
                Text("This device owns one restaurant account. You can edit every detail before publishing.")
                    .foregroundStyle(Theme.accent)
                content
                if let error { Text(error).foregroundStyle(Theme.accent) }
                if loading { ProgressView() }
            }
            .padding()
        }
        .task(id: app.deviceId) { await loadAccount() }
        .onDisappear { statusSub?.cancel() }
        .confirmationDialog("Start over with a fresh restaurant?", isPresented: $showingResetConfirmation, titleVisibility: .visible) {
            Button("Start over", role: .destructive) { startFreshRestaurant() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your previous imported menu will remain saved, but this device will use a new restaurant identity and start at menu import.")
        }
    }

    @ViewBuilder private var content: some View {
        if onboardingId == nil || showSourceEntry {
            Picker("How would you like to add your menu?", selection: $acquisition) {
                Text("Paste a restaurant or menu URL").tag(Acquisition.url)
                Text("Find it automatically").tag(Acquisition.search)
            }
            .pickerStyle(.segmented)
            TextField(acquisition == .url ? "Restaurant or menu URL" : "Restaurant name", text: acquisition == .url ? $sourceURL : $name).appFieldStyle()
            TextField(acquisition == .url ? "City or location (optional)" : "City or location", text: $address).appFieldStyle()
            if acquisition == .search { Text("This may take several minutes. You’ll choose a result before reviewing its menu.").font(AppTypography.footnote).foregroundStyle(Theme.accent) }
            Button(acquisition == .url ? "Import menu" : "Find it automatically") { Task { await submitDetails() } }
                .buttonStyle(BigButtonStyle()).disabled((acquisition == .url ? sourceURL : name).trimmed.isEmpty || (acquisition == .search && address.trimmed.isEmpty) || saving)
            VStack(alignment: .leading, spacing: 8) {
                Text("Just want to demo the ordering flow?")
                    .font(AppTypography.footnote)
                    .foregroundStyle(Theme.accent)
                Button(skipping ? "Preparing demo menu…" : "Skip setup — use demo menu") { Task { await skipToDemo() } }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(saving || skipping)
            }
        } else if let onboarding, ["awaiting_source", "created", "details_submitted", "scraping_url", "scraping_search", "finding_restaurant"].contains(onboarding.status) {
            ProgressView(onboarding.status == "scraping_search" ? "Searching menus…" : "Importing menu…")
        } else if let onboarding, ["search_results_ready", "candidates_ready"].contains(onboarding.status) {
            Text("Choose a menu to review").font(AppTypography.headline)
            ForEach(onboarding.candidates) { candidate in
                Button { Task { await select(candidate) } } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(candidate.name).font(AppTypography.headline)
                        Text(candidate.address).font(AppTypography.footnote)
                        if let confidence = candidate.confidence { Text("Confidence: \(confidence)").font(AppTypography.caption) }
                        if let url = candidate.sourceUrl { Text(url).font(AppTypography.caption).lineLimit(1) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Theme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }
            Button("I’ll enter a URL manually") { resetToSourceEntry() }
                .buttonStyle(SecondaryButtonStyle())
        } else if let onboarding, ["scrape_failed", "manual_review", "match_failed", "normalization_failed"].contains(onboarding.status) {
            Text(onboarding.errorMessage ?? "We couldn’t import a usable menu.").foregroundStyle(Theme.accent)
            Button("Try another URL") { resetToSourceEntry() }.buttonStyle(BigButtonStyle())
        } else if let draft {
            MenuDraftEditor(draft: draft, saving: saving) { items in Task { await update(items) } } publish: { items in Task { await publish(items) } }
        } else {
            ProgressView(onboarding?.status == "normalizing" ? "Normalizing menu…" : "Preparing review…")
        }
    }

    private func loadAccount() async {
        loading = true; defer { loading = false }
        do {
            let account = try await app.backend.restaurantAccount(deviceId: app.deviceId, displayName: "Restaurant")
            if let id = account.onboardingId {
                onboardingId = id
                subscribe(id)
            }
        } catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func startFreshRestaurant() {
        statusSub?.cancel()
        onboardingId = nil
        onboarding = nil
        draft = nil
        showSourceEntry = false
        sourceURL = ""
        name = ""
        address = ""
        error = nil
        app.deviceId = UUID().uuidString
    }

    private func submitDetails() async {
        saving = true; defer { saving = false }
        do {
            let id: String
            if let onboardingId { id = onboardingId } else { id = try await app.backend.createRestaurantDraft(deviceId: app.deviceId, name: acquisition == .url ? "Restaurant" : name.trimmed, address: address.trimmed); self.onboardingId = id; subscribe(id) }
            showSourceEntry = false
            if acquisition == .url {
                try await app.backend.startRestaurantUrlImport(deviceId: app.deviceId, onboardingId: id, url: sourceURL.trimmed, location: address.trimmed.isEmpty ? nil : address.trimmed)
            } else {
                try await app.backend.startRestaurantSearch(deviceId: app.deviceId, onboardingId: id, query: name.trimmed, location: address.trimmed)
            }
        } catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func skipToDemo() async {
        skipping = true; defer { skipping = false }
        do {
            try await app.backend.skipRestaurantOnboarding(deviceId: app.deviceId)
            onReady()
        } catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func subscribe(_ id: String) {
        statusSub?.cancel()
        statusSub = app.backend.restaurantOnboardingStatus(deviceId: app.deviceId, onboardingId: id)
            .sink(receiveCompletion: { completion in if case .failure(let e) = completion { self.error = e.userMessage } }, receiveValue: { value in
                onboarding = value
                if value?.status == "ready" {
                    onReady()
                    return
                }
                if let value, ["review_required", "manual_review", "normalization_failed"].contains(value.status) {
                    let loadKey = "\(id):\(value.status)"
                    guard lastDraftLoadKey != loadKey else { return }
                    lastDraftLoadKey = loadKey
                    Task { await loadDraftIfNeeded() }
                }
            })
    }

    private func select(_ candidate: RestaurantCandidate) async {
        guard let onboardingId else { return }; saving = true; defer { saving = false }
        do {
            try await app.backend.selectRestaurantCandidate(deviceId: app.deviceId, onboardingId: onboardingId, candidate: candidate)
        } catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func resetToSourceEntry() { acquisition = .url; sourceURL = ""; showSourceEntry = true; draft = nil; error = nil }

    private func loadDraftIfNeeded() async {
        guard let onboardingId, !draftLoadInFlight else { return }
        draftLoadInFlight = true
        defer { draftLoadInFlight = false }
        do { draft = try await app.backend.restaurantDraft(deviceId: app.deviceId, onboardingId: onboardingId) }
        catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func update(_ items: [RestaurantMenuItem]) async {
        guard let onboardingId else { return }; saving = true; defer { saving = false }
        do { try await app.backend.updateRestaurantDraft(deviceId: app.deviceId, onboardingId: onboardingId, items: items); await loadDraftIfNeeded() }
        catch let caught { self.error = TTError.from(caught).userMessage }
    }

    private func publish(_ items: [RestaurantMenuItem]) async {
        guard let onboardingId else { return }; saving = true; defer { saving = false }
        do { try await app.backend.publishRestaurant(deviceId: app.deviceId, onboardingId: onboardingId, items: items) }
        catch let caught { self.error = TTError.from(caught).userMessage }
    }
}

private struct MenuDraftEditor: View {
    let draft: RestaurantMenuDraft
    let saving: Bool
    let onSave: ([RestaurantMenuItem]) -> Void
    let publish: ([RestaurantMenuItem]) -> Void
    @State private var items: [RestaurantMenuItem]

    init(draft: RestaurantMenuDraft, saving: Bool, onSave: @escaping ([RestaurantMenuItem]) -> Void, publish: @escaping ([RestaurantMenuItem]) -> Void) {
        self.draft = draft; self.saving = saving; self.onSave = onSave; self.publish = publish
        _items = State(initialValue: draft.editedItems)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Review menu").font(AppTypography.style(.title, weight: .bold))
            Text("Scraped details require your review.").font(AppTypography.footnote).foregroundStyle(Theme.accent)
            ForEach($items) { $item in
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Item name", text: $item.name).appFieldStyle()
                    TextField("Description", text: $item.description).appFieldStyle()
                    HStack {
                        TextField(item.priceVerified == false ? "Estimated price in cents" : "Price cents", value: $item.priceCents, format: .number)
                            .appFieldStyle()
                            .onChange(of: item.priceCents) { _, newPrice in
                                if newPrice > 0 { item.priceVerified = true }
                            }
                        Text(item.category).foregroundStyle(Theme.accent)
                    }
                    if item.priceVerified == false && item.priceCents > 0 {
                        Text("Estimated price — edit if needed before publishing.")
                            .font(AppTypography.footnote).foregroundStyle(Theme.accent)
                    }
                }
                .padding(.vertical, 4)
            }
            HStack {
                Button("Save edits") { onSave(items) }.buttonStyle(SecondaryButtonStyle())
                Button("Publish menu") { publish(items) }.buttonStyle(BigButtonStyle()).disabled(items.isEmpty || saving)
            }
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

struct RestaurantRootView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let store: PartyStore

    var body: some View {
        Group {
            switch store.party?.status {
            case nil: ProgressView()
            case .checkin: CheckInView(store: store)
            case .hunger: HungerWaitView(store: store)
            case .negotiating, .pick: TableTalkView(store: store)
            case .confirm: ProgressBoardView(store: store)
            case .placed: OrderReceivedView(store: store)
            }
        }
        .id(store.party?.status.rawValue ?? "loading")
        .transition(AppPageTransition.transition(reduceMotion: reduceMotion))
        .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: store.party?.status)
    }
}
