// Owner: Role 1. Diner routing. The SERVER moves every phone at once: this view switches on party.status,
// and no screen ever pushes another.
import SwiftUI

struct DinerFlow: View {
    @Environment(AppModel.self) private var app
    @Binding var pendingJoinCode: String?
    @AppStorage("tt.debugOverlay") private var debugOverlay = false

    var body: some View {
        VStack(spacing: 0) {
            LogoHeader()
            Group {
                if app.userId == nil {
                    OnboardingFlow()                              // Role 2 → sets app.userId
                } else if let partyId = app.partyId {
                    PartyScope(partyId: partyId, userId: app.userId) { store in DinerRootView(store: store) }
                } else {
                    TapInView(pendingJoinCode: $pendingJoinCode)  // Role 2 → sets app.partyId
                }
            }
            .frame(maxHeight: .infinity)
        }
        .overlay(alignment: .bottom) { if debugOverlay { ProximityDebugOverlay() } }
    }
}

struct DinerRootView: View {
    let store: PartyStore

    var body: some View {
        Group {
            switch store.party?.status {
            case nil: ProgressView("Loading your table…")
            case .checkin: WaitingView(title: "You're in!", subtitle: "Waiting for everyone to tap in", store: store) { _ in true }
            case .hunger:
                if store.me?.hunger == nil { HungerView(store: store) }
                else { WaitingView(title: "Waiting for the table", subtitle: "Who's chosen so far", store: store) { $0.hunger != nil } }
            case .negotiating: NegotiatingView(store: store)
            case .pick:
                if store.me?.picked == true { WaitingView(title: "Locked in", subtitle: "Waiting for the others", store: store) { $0.picked } }
                else { PickView(store: store) }
            case .confirm: GroupOrderView(store: store)
            case .placed: OrderPlacedView(store: store)
            }
        }
        .animation(.easeInOut, value: store.party?.status)
    }
}

struct WaitingView: View {
    let title: String
    let subtitle: String
    let store: PartyStore
    let done: (Member) -> Bool

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text(title).font(.largeTitle.bold())
            Text(subtitle).foregroundStyle(.secondary)
            MemberTicks(members: store.party?.members ?? [], done: done)
            Spacer()
        }
        .padding()
    }
}
