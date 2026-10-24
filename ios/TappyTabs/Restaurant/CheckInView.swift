// Owner: Role 2. "2 of 4 checked in", avatars pop in with a haptic, small QR, "Start with fewer" at ≥ 2.
// Hosts UWB: on a tap, calls parties:join for that diner; FULL → tells the diner's phone over Multipeer.
import SwiftUI

struct CheckInView: View {
    @Environment(AppModel.self) private var app
    let store: PartyStore
    @State private var proximity = Proximity.shared

    private var members: [Member] { store.party?.members ?? [] }

    var body: some View {
        VStack(spacing: 20) {
            Text("\(members.count) of \(Int(store.party?.size ?? 0)) checked in")
                .font(.system(size: 40, weight: .bold)).contentTransition(.numericText()).padding(.top)
            Text("Hold your phone to this one").foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 18) {
                ForEach(members) { m in
                    VStack {
                        AvatarView(avatarId: m.avatarId, size: 80, state: store.lastError == nil ? .happy : .confused)
                        Text(m.name).font(.headline)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.4, bounce: 0.5), value: members.count)
            Spacer()
            HStack(alignment: .bottom) {
                VStack(alignment: .leading) {
                    if let code = store.party?.joinCode {
                        QRImage(joinCode: code).frame(width: 110, height: 110)
                        Text(code).font(.caption.monospaced())
                    }
                }
                Spacer()
                VStack(spacing: 8) {
                    if let mock = app.mock { Button("Simulate tap") { mock.simulateTap() }.font(.footnote) }
                    Button("Start with fewer") { Task { await store.startWithFewer() } }
                        .buttonStyle(.borderedProminent).disabled(members.count < 2)
                }
            }
        }
        .padding()
        .onChange(of: members.count) { old, new in if new > old { UINotificationFeedbackGenerator().notificationOccurred(.success) } }
        .task(id: store.partyId) {
            proximity.startHosting(partyId: store.partyId) { userId in
                Task {
                    if let e = await store.admit(userId: userId, via: .uwb), e.code == .FULL {
                        proximity.reject(userId: userId, reason: "Table is full")
                    }
                }
            }
        }
        .onDisappear { proximity.stop() }
    }
}

struct HungerWaitView: View {
    let store: PartyStore
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("Everyone's here!").font(.largeTitle.bold())
            Text("Choosing hunger levels…").foregroundStyle(.secondary)
            MemberTicks(members: store.party?.members ?? []) { $0.hunger != nil }
            Spacer()
        }
    }
}
