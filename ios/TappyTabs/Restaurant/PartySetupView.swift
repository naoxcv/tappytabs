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
    @State private var note: String?
    @State private var error: String?
    @State private var menuSub: AnyCancellable?

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
                                .buttonStyle(.borderedProminent)
                                .foregroundStyle(Theme.accentForeground)
                                .disabled(restaurant == nil || opening)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
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
                    .font(AppTypography.footnote)
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
        restaurant = nil
        menu = nil
        error = nil
        do {
            let backend = app.backend
            let nextRestaurant = try await backend.restaurants().first
            try Task.checkCancellation()
            restaurant = nextRestaurant
            if let restaurant {
                menuSub = backend.menuStatus(restaurant.id).replaceError(with: nil).sink { menu = $0 }
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

    private func open(size: Int) async {
        guard let restaurant, !opening else { return }
        opening = true
        defer { opening = false }
        let backend = app.backend
        let deviceId = app.deviceId
        do {
            let created = try await backend.createParty(restaurantId: restaurant.id, size: size, hostDeviceId: deviceId)
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
