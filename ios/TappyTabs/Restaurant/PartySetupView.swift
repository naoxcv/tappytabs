// Owner: Role 2. Choosing a party size opens the table and starts proximity hosting.
import Combine
import SwiftUI

struct PartySetupView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @State private var opening = false
    @State private var restaurant: RestaurantRef?
    @State private var menu: MenuStatus?
    @State private var fetching = false
    @State private var autoMode = false
    @State private var note: String?
    @State private var error: String?
    @State private var menuSub: AnyCancellable?
    @State private var onboardingSub: AnyCancellable?
    @State private var onboardingId: String?
    @State private var savedDraftItems: [RestaurantMenuItem] = []
    @State private var normalizing = false
    @State private var reprocessing = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                let layout = verticalSizeClass == .compact
                    ? AnyLayout(HStackLayout(alignment: .center, spacing: 32))
                    : AnyLayout(VStackLayout(spacing: 24))
                layout {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(restaurant?.name ?? "Loading…")
                            .font(AppTypography.style(.largeTitle, weight: .bold))
                        menuLine
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(spacing: 8) {
                        Text("How many diners?").font(AppTypography.headline)
                        HStack(spacing: 10) {
                            ForEach(2...6, id: \.self) { count in
                                Button { Task { await open(size: count) } } label: {
                                    Text("\(count)")
                                        .font(AppTypography.style(.title, weight: .bold))
                                        .frame(maxWidth: .infinity, minHeight: 64)
                                }
                                .buttonStyle(BigButtonStyle())
                                .disabled(restaurant == nil || opening)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                Toggle(isOn: $autoMode) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Auto mode").font(AppTypography.headline)
                        Text("Skip the prompts. Use normal hunger, each diner's top main, and place the order automatically.")
                            .font(AppTypography.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(Theme.accent)
                if !savedDraftItems.isEmpty {
                    Button(reprocessing ? "Starting…" : "Complete saved menu for demo") {
                        Task { await completeSavedMenu() }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(reprocessing || normalizing)
                    if normalizing { ProgressView("Completing all \(savedDraftItems.count) dishes…") }
                }
                if let error { Text(error).foregroundStyle(Theme.accent) }
                if opening { ProgressView("Opening table…") }
            }
            .padding()
        }
        .task(id: "\(app.backendKind.rawValue)|\(app.convexURL)") { await load() }
    }

    private var menuLine: some View {
        HStack {
            if let menu {
                Text("Menu from \(menu.name) via \(menu.source == "apify" ? "Apify" : "seed snapshot") · \(Int(menu.itemCount)) items\(fetchedText(menu))")
                    .font(AppTypography.footnote).foregroundStyle(Theme.accent)
            }
            Spacer()
            if fetching { ProgressView() } else {
                Button("Fetch menu") { Task { await fetch() } }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(restaurant == nil)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if let note { Text(note).font(AppTypography.caption2).foregroundStyle(Theme.accent).offset(y: 16) }
        }
    }

    private func fetchedText(_ menu: MenuStatus) -> String {
        guard let fetchedAt = menu.fetchedAt else { return "" }
        return " · fetched " + Date(timeIntervalSince1970: fetchedAt / 1000).formatted(date: .omitted, time: .shortened)
    }

    private func load() async {
        menuSub = nil
        onboardingSub = nil
        restaurant = nil
        menu = nil
        onboardingId = nil
        savedDraftItems = []
        normalizing = false
        error = nil
        do {
            let backend = app.backend
            let nextRestaurant = app.backendKind == .live
                ? try await backend.ownedRestaurant(deviceId: app.deviceId)
                : try await backend.restaurants().first
            try Task.checkCancellation()
            restaurant = nextRestaurant
            if let restaurant {
                menuSub = backend.menuStatus(restaurant.id).replaceError(with: nil).sink { menu = $0 }
            }
            if app.backendKind == .live {
                let account = try await backend.restaurantAccount(deviceId: app.deviceId, displayName: "Restaurant")
                if let id = account.onboardingId,
                   let draft = try await backend.restaurantDraft(deviceId: app.deviceId, onboardingId: id) {
                    onboardingId = id
                    savedDraftItems = draft.editedItems
                    onboardingSub = backend.restaurantOnboardingStatus(deviceId: app.deviceId, onboardingId: id)
                        .sink(receiveCompletion: { completion in
                            if case .failure(let caught) = completion { error = caught.userMessage }
                        }, receiveValue: { status in
                            guard let status else { return }
                            normalizing = status.status == "normalizing"
                            if status.status == "normalization_failed" {
                                error = status.errorMessage ?? "Could not complete the saved menu. You can retry."
                            } else if status.status == "ready", note == "Completing saved menu…" {
                                note = "Complete menu saved for the next table"
                                error = nil
                            }
                        })
                }
            }
        } catch is CancellationError {
            return
        } catch {
            if !Task.isCancelled { self.error = TTError.from(error).userMessage }
        }
    }

    private func fetch() async {
        guard let restaurant else { return }
        fetching = true
        note = (try? await app.backend.ingestMenu(restaurantId: restaurant.id))?.note
        fetching = false
    }

    private func completeSavedMenu() async {
        guard let onboardingId, !savedDraftItems.isEmpty, !normalizing, !reprocessing else { return }
        reprocessing = true
        error = nil
        note = "Completing saved menu…"
        defer { reprocessing = false }
        do {
            try await app.backend.publishRestaurant(
                deviceId: app.deviceId,
                onboardingId: onboardingId,
                items: savedDraftItems
            )
        } catch {
            note = nil
            self.error = TTError.from(error).userMessage
        }
    }

    private func open(size: Int) async {
        guard let restaurant, !opening else { return }
        opening = true
        defer { opening = false }
        let backend = app.backend
        let deviceId = app.deviceId
        do {
            let created = try await backend.createParty(
                restaurantId: restaurant.id,
                size: size,
                hostDeviceId: deviceId,
                autoMode: autoMode
            )
            guard app.backend === backend, app.deviceId == deviceId, app.mode == .restaurant,
                  app.partyId == nil else { return }
            app.partyId = created.partyId
        } catch {
            if app.backend === backend, app.deviceId == deviceId, app.mode == .restaurant {
                self.error = TTError.from(error).userMessage
            }
        }
    }
}
