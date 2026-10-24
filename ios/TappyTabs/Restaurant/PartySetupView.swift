// Owner: Role 2. Size stepper 2–6, menu status line with "Fetch menu" (never blocks starting), "Open table".
import Combine
import SwiftUI

struct PartySetupView: View {
    @Environment(AppModel.self) private var app
    @State private var size = 4
    @State private var restaurant: RestaurantRef?
    @State private var menu: MenuStatus?
    @State private var fetching = false
    @State private var note: String?
    @State private var error: String?
    @State private var menuSub: AnyCancellable?

    var body: some View {
        VStack(spacing: 24) {
            Text(restaurant?.name ?? "Loading…").font(.largeTitle.bold()).padding(.top, 24)
            menuLine
            Spacer()
            Text("Party size").font(.headline)
            HStack(spacing: 30) {
                Button { size = max(2, size - 1) } label: { Image(systemName: "minus.circle.fill").font(.system(size: 44)) }
                Text("\(size)").font(.system(size: 72, weight: .bold)).monospacedDigit()
                Button { size = min(6, size + 1) } label: { Image(systemName: "plus.circle.fill").font(.system(size: 44)) }
            }
            Spacer()
            if let error { Text(error).foregroundStyle(.red) }
            Button("Open table") { Task { await open() } }.buttonStyle(BigButtonStyle()).disabled(restaurant == nil)
        }
        .padding()
        .task(id: "\(app.backendKind.rawValue)|\(app.convexURL)") { await load() }
    }

    private var menuLine: some View {
        HStack {
            if let menu {
                Text("Menu from \(menu.name) via \(menu.source == "apify" ? "Apify" : "seed snapshot") · \(Int(menu.itemCount)) items\(fetchedText(menu))")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if fetching { ProgressView() } else {
                Button("Fetch menu") { Task { await fetch() } }.font(.footnote).disabled(restaurant == nil)
            }
        }
        .overlay(alignment: .bottomLeading) { if let note { Text(note).font(.caption2).foregroundStyle(.secondary).offset(y: 16) } }
    }

    private func fetchedText(_ m: MenuStatus) -> String {
        guard let t = m.fetchedAt else { return "" }
        return " · fetched " + Date(timeIntervalSince1970: t / 1000).formatted(date: .omitted, time: .shortened)
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
            if let r = restaurant {
                menuSub = backend.menuStatus(r.id).replaceError(with: nil).sink { menu = $0 }
            }
        } catch is CancellationError {
            return
        } catch {
            if !Task.isCancelled { self.error = TTError.from(error).userMessage }
        }
    }

    private func fetch() async {
        guard let r = restaurant else { return }
        fetching = true
        note = (try? await app.backend.ingestMenu(restaurantId: r.id))?.note
        fetching = false
    }

    private func open() async {
        guard let r = restaurant else { return }
        do {
            let created = try await app.backend.createParty(restaurantId: r.id, size: size, hostDeviceId: app.deviceId)
            app.partyId = created.partyId
        } catch { self.error = TTError.from(error).userMessage }
    }
}
