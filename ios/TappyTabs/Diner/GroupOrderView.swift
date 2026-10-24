// Owner: Role 1. Stage 2: "For the table" + "Yours", remove → agent substitute sheet, add sheet with share toggle, confirm.
import SwiftUI

struct GroupOrderView: View {
    let store: PartyStore
    @State private var substitute: RemoveResult.Substitute?
    @State private var showAdd = false

    private var confirmed: Bool { store.me?.confirmed == true }

    var body: some View {
        List {
            if let deadline = store.party?.confirmDeadline {
                Countdown(deadlineMs: deadline, offsetMs: store.serverOffsetMs)
            }
            Section("For the table") {
                if store.sharedLines.isEmpty { Text("Nothing shared").foregroundStyle(.secondary) }
                ForEach(store.sharedLines) { line in
                    LineRow(line: line, avatars: line.sharedBy.compactMap { store.avatar(of: $0) })
                        .swipeActions { if !confirmed { removeButton(line) } }
                }
            }
            Section("Yours") {
                ForEach(store.myLines()) { line in
                    LineRow(line: line, avatars: [])
                        .swipeActions { if !confirmed { removeButton(line) } }
                }
                if !confirmed { Button { showAdd = true } label: { Label("Add something", systemImage: "plus") } }
            }
            Section("Everyone else") {
                ForEach(store.party?.members.filter { $0.userId != store.userId } ?? []) { m in
                    HStack {
                        AvatarView(avatarId: m.avatarId, size: 28)
                        Text(store.myLines(m.userId).map(\.name).joined(separator: ", ")).font(.subheadline)
                        Spacer()
                        if m.confirmed { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                HStack {
                    Text("Your share").bold(); PriceText(cents: store.myShareCents).bold()
                    Spacer()
                    Text("Table"); PriceText(cents: store.lines.totals.total)
                }
                if confirmed {
                    Label("Confirmed, waiting for others", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                } else {
                    Button("Confirm my order") {
                        Task { await store.confirm(); UINotificationFeedbackGenerator().notificationOccurred(.success) }
                    }.buttonStyle(BigButtonStyle())
                }
            }
            .padding().background(.bar)
        }
        .sheet(item: $substitute) { sub in SubstituteSheet(sub: sub, store: store) }
        .sheet(isPresented: $showAdd) { AddSheet(store: store) }
    }

    private func removeButton(_ line: Line) -> some View {
        Button(role: .destructive) {
            Task { if let s = await store.remove(line.lineId) { substitute = s } }
        } label: { Label("Remove", systemImage: "minus.circle") }
    }
}

extension RemoveResult.Substitute: Identifiable { var id: String { itemId } }

struct LineRow: View {
    let line: Line
    let avatars: [String]
    var body: some View {
        HStack {
            Text("\(Int(line.qty))×").foregroundStyle(.secondary)
            VStack(alignment: .leading) {
                Text(line.name)
                if line.askServer { AskServerBadge() }
            }
            Spacer()
            HStack(spacing: -8) { ForEach(avatars, id: \.self) { AvatarView(avatarId: $0, size: 22) } }
            PriceText(cents: line.priceCents * line.qty)
        }
    }
}

struct SubstituteSheet: View {
    let sub: RemoveResult.Substitute
    let store: PartyStore
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(spacing: 16) {
            Text("Swap for \(sub.name)?").font(.title2.bold())
            Text(sub.reason).foregroundStyle(.secondary)
            PriceText(cents: sub.priceCents).font(.title3)
            if sub.askServer { AskServerBadge() }
            Button("Swap") { Task { await store.add(sub.itemId, shared: false); dismiss() } }.buttonStyle(BigButtonStyle())
            Button("No thanks") { dismiss() }
        }
        .padding()
        .presentationDetents([.medium])
    }
}

struct AddSheet: View {
    let store: PartyStore
    @Environment(\.dismiss) private var dismiss
    @State private var shared = false
    @State private var items: [AddableItem] = []

    var body: some View {
        NavigationStack {
            List {
                Toggle("Share with the table", isOn: $shared)
                ForEach(items) { item in
                    Button {
                        Task { await store.add(item.itemId, shared: shared); dismiss() }
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(item.name)
                                Text(item.category.capitalized).font(.caption).foregroundStyle(.secondary)
                                if item.askServer { AskServerBadge() }
                            }
                            Spacer()
                            PriceText(cents: item.priceCents)
                        }
                    }
                }
            }
            .navigationTitle(shared ? "Safe for everyone" : "Safe for you")
            .toolbar { Button("Close") { dismiss() } }
        }
        .task(id: shared) {
            guard let userId = store.userId else { return }
            for await value in store.backend.addable(store.partyId, userId: userId, shared: shared).replaceError(with: []).values {
                items = value
                break
            }
        }
    }
}
