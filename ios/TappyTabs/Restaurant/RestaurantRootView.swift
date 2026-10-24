// Owner: Role 2. Restaurant phone: setup → check-in (hosting UWB) → hunger wait → table talk → progress → ticket.
import SwiftUI

struct RestaurantFlow: View {
    @Environment(AppModel.self) private var app
    @AppStorage("tt.debugOverlay") private var debugOverlay = false

    var body: some View {
        VStack(spacing: 0) {
            LogoHeader()
            Group {
                if let partyId = app.partyId {
                    PartyScope(partyId: partyId, userId: nil) { store in RestaurantRootView(store: store) }
                } else {
                    PartySetupView()
                }
            }
            .frame(maxHeight: .infinity)
        }
        .overlay(alignment: .bottom) { if debugOverlay { ProximityDebugOverlay() } }
        .task {
            // Relaunch: resume the table this phone was hosting.
            if app.partyId == nil, let hosted = try? await app.backend.hosted(hostDeviceId: app.deviceId), hosted.status != .placed {
                app.partyId = hosted.partyId
            }
        }
    }
}

struct RestaurantRootView: View {
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
        .animation(.easeInOut, value: store.party?.status)
    }
}
