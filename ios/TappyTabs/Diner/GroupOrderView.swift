// Owner: Role 1. Stage 2: "For the table" + "Yours", remove → agent substitute sheet, add sheet with share toggle, confirm.
import SwiftUI

struct GroupOrderView: View {
    let store: PartyStore
    @State private var substitute: RemoveResult.Substitute?
    @State private var showAdd = false
    @State private var removingLineId: String?

    private var confirmed: Bool { store.me?.confirmed == true }

    var body: some View {
        List {
            if let deadline = store.party?.confirmDeadline {
                Countdown(deadlineMs: deadline, offsetMs: store.serverOffsetMs)
            }
            Section(header: Text("For the table").font(AppTypography.headline)) {
                if store.sharedLines.isEmpty { Text("Nothing shared").foregroundStyle(Theme.accent) }
                ForEach(store.sharedLines) { line in
                    HStack {
                        LineRow(line: line, avatars: line.sharedBy.compactMap { store.avatar(of: $0) })
                        if !confirmed { removeButton(line) }
                    }
                }
            }
            Section(header: Text("Yours").font(AppTypography.headline)) {
                ForEach(store.myLines()) { line in
                    HStack {
                        LineRow(line: line, avatars: [])
                        if !confirmed { removeButton(line) }
                    }
                }
                if !confirmed {
                    Button { showAdd = true } label: { Label("Add something", systemImage: "plus") }
                        .disabled(removingLineId != nil)
                }
            }
            Section(header: Text("Everyone else").font(AppTypography.headline)) {
                ForEach(store.party?.members.filter { $0.userId != store.userId } ?? []) { m in
                    HStack {
                        AvatarView(avatarId: m.avatarId, size: 28)
                        Text(store.myLines(m.userId).map(\.name).joined(separator: ", ")).font(AppTypography.subheadline)
                        Spacer()
                        if m.confirmed { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let substitute {
                    VStack(spacing: 6) {
                        Text("Swap for \(substitute.name)?").font(AppTypography.style(.headline, weight: .bold))
                        Text(substitute.reason).font(AppTypography.footnote).foregroundStyle(Theme.accent)
                        HStack {
                            PriceText(cents: substitute.priceCents)
                            if substitute.askServer { AskServerBadge() }
                        }
                        HStack {
                            Button("No thanks") { self.substitute = nil }
                            Spacer()
                            Button("Swap") {
                                self.substitute = nil
                                Task { await store.add(substitute.itemId, shared: false) }
                            }
                            .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding(10)
                    .background(Theme.background, in: RoundedRectangle(cornerRadius: 10))
                }
                HStack {
                    Text("Your share").bold(); PriceText(cents: store.myShareCents).bold()
                    Spacer()
                    Text("Table"); PriceText(cents: store.lines.totals.total)
                }
                if confirmed {
                    Label("Confirmed, waiting for others", systemImage: "checkmark.seal.fill").foregroundStyle(Theme.accent)
                } else {
                    Button("Confirm my order") {
                        Task { await store.confirm(); UINotificationFeedbackGenerator().notificationOccurred(.success) }
                    }.buttonStyle(BigButtonStyle()).disabled(removingLineId != nil)
                }
            }
            .padding().background(.bar)
        }
        .sheet(isPresented: $showAdd) {
            AddSheet(store: store)
                .presentationBackground(Theme.background)
        }
    }

    private func removeButton(_ line: Line) -> some View {
        Button(role: .destructive) {
            guard removingLineId == nil else { return }
            removingLineId = line.lineId
            substitute = nil
            Task {
                let replacement = await store.remove(line.lineId)
                removingLineId = nil
                if store.party?.status == .confirm, !confirmed { substitute = replacement }
            }
        } label: {
            Image(systemName: "minus.circle")
                .font(.title3)
                .foregroundStyle(Theme.accent)
                .accessibilityLabel("Remove \(line.name)")
        }
        .buttonStyle(.borderless)
        .disabled(removingLineId != nil)
    }
}

struct LineRow: View {
    let line: Line
    let avatars: [String]
    var body: some View {
        HStack {
            Text("\(Int(line.qty))×").foregroundStyle(Theme.accent)
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
                                Text(item.category.capitalized).font(AppTypography.caption).foregroundStyle(Theme.accent)
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
