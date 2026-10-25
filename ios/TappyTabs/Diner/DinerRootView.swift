// Owner: Role 1. Diner routing. The SERVER moves every phone at once: this view switches on party.status,
// and no screen ever pushes another.
import Combine
import SwiftUI

struct DinerFlow: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var pendingJoinCode: String?
    @AppStorage("tt.debugOverlay") private var debugOverlay = false
    @State private var resumeWatch: AnyCancellable?
    @State private var checkedUserId: String?
    @State private var resumeError: String?

    var body: some View {
        VStack(spacing: 0) {
            LogoHeader()
            Group {
                if app.userId == nil {
                    OnboardingFlow()                              // Role 2 → sets app.userId
                } else if let partyId = app.partyId {
                    PartyScope(partyId: partyId, userId: app.userId) { store in DinerRootView(store: store) }
                } else if checkedUserId != app.userId {
                    VStack(spacing: 12) {
                        if let resumeError {
                            Text(resumeError).foregroundStyle(Theme.accent)
                            Button("Retry") { watchForExistingTable() }.buttonStyle(.bordered)
                        } else {
                            ProgressView("Checking your table…")
                        }
                    }
                } else {
                    TapInView(pendingJoinCode: $pendingJoinCode)  // Role 2 → sets app.partyId
                }
            }
            .id(flowKey)
            .transition(AppPageTransition.transition(reduceMotion: reduceMotion))
            .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: flowKey)
            .frame(maxHeight: .infinity)
        }
        .overlay(alignment: .bottom) { if debugOverlay { ProximityDebugOverlay() } }
        .task(id: app.userId) { watchForExistingTable() }
        .onChange(of: app.partyId) { _, partyId in
            if partyId == nil { watchForExistingTable() }
            else { resumeWatch = nil }
        }
        .onChange(of: app.tapSearchPaused) { _, paused in
            if paused { resumeWatch = nil }
            else if app.partyId == nil { watchForExistingTable() }
        }
        .onDisappear { resumeWatch = nil }
    }

    private var flowKey: String {
        if app.userId == nil { return "onboarding" }
        if app.partyId != nil { return "party" }
        return checkedUserId == app.userId ? "tap-in" : "resume-check"
    }

    private func watchForExistingTable() {
        resumeWatch = nil
        resumeError = nil
        guard let userId = app.userId else { checkedUserId = nil; return }
        guard app.partyId == nil, !app.tapSearchPaused else { checkedUserId = userId; return }
        checkedUserId = nil
        let backend = app.backend
        resumeWatch = backend.forUserUpdates(userId: userId).sink(
            receiveCompletion: { completion in
                guard app.mode == .diner, app.userId == userId, app.backend === backend else { return }
                if case .failure(let error) = completion {
                    resumeError = error.userMessage
                    checkedUserId = nil
                }
            },
            receiveValue: { hosted in
                guard app.mode == .diner, app.userId == userId, app.backend === backend else { return }
                checkedUserId = userId
                if let hosted, app.partyId == nil, !app.tapSearchPaused {
                    app.partyId = hosted.partyId
                    resumeWatch = nil
                }
            }
        )
    }
}

struct DinerRootView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
        .id(pageKey)
        .transition(AppPageTransition.transition(direction: transitionDirection, reduceMotion: reduceMotion))
        .animation(AppPageTransition.animation(reduceMotion: reduceMotion), value: pageKey)
        .onChange(of: store.party) { _, party in
            if let party, app.partyId == store.partyId, app.userId == store.userId,
               party.member(app.userId) == nil { app.leaveTable() }
        }
    }

    private var pageKey: String {
        guard let status = store.party?.status else { return "loading" }
        switch status {
        case .hunger: return store.me?.hunger == nil ? "hunger" : "hunger-wait"
        case .pick: return store.me?.picked == true ? "pick-wait" : "pick"
        default: return status.rawValue
        }
    }

    private var transitionDirection: CGFloat {
        guard let status = store.party?.status else { return 1 }
        switch status {
        case .checkin: return -1
        case .hunger: return 1
        case .negotiating: return 1
        case .pick: return 1
        case .confirm: return 1
        case .placed: return 1
        }
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
            Text(title).font(AppTypography.style(.largeTitle, weight: .bold))
            Text(subtitle).foregroundStyle(Theme.accent)
            MemberTicks(members: store.party?.members ?? [], done: done)
            Spacer()
        }
        .padding()
    }
}
