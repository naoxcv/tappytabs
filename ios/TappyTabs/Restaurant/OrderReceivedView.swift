// Owner: Role 2. Progress during confirm, and the final ticket with ask-server flags and a "New table" reset.
import SwiftUI

struct ProgressBoardView: View {
    let store: PartyStore
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            let members = store.party?.members ?? []
            Text("\(members.filter(\.confirmed).count) of \(members.count) confirmed").font(.system(size: 40, weight: .bold))
            MemberTicks(members: members) { $0.confirmed }
            if let d = store.party?.confirmDeadline { Countdown(deadlineMs: d, offsetMs: store.serverOffsetMs) }
            Spacer()
        }
    }
}

struct OrderReceivedView: View {
    @Environment(AppModel.self) private var app
    let store: PartyStore

    var body: some View {
        VStack(spacing: 0) {
            Text("Order received").font(.largeTitle.bold()).padding()
            List {
                Section("For the table") {
                    ForEach(store.sharedLines) { line in ticketRow(line) }
                }
                ForEach(store.party?.members ?? []) { m in
                    Section(m.name) { ForEach(store.myLines(m.userId)) { line in ticketRow(line) } }
                }
                Section {
                    HStack { Text("Table total").bold(); Spacer(); PriceText(cents: store.lines.totals.total).bold() }
                }
            }
            Button("New table") { Task { await store.reset() } }.buttonStyle(BigButtonStyle()).padding()
        }
        .onAppear { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    }

    private func ticketRow(_ line: Line) -> some View {
        HStack {
            Text("\(Int(line.qty))× \(line.name)")
            if line.askServer { AskServerBadge() }
            Spacer()
            PriceText(cents: line.priceCents * line.qty)
        }
        .listRowBackground(line.askServer ? Color.yellow.opacity(0.15) : nil)
    }
}
