// Owner: Role 2. "2 of 4 checked in", avatars pop in with a haptic, small QR, "Start with fewer" at ≥ 2.
// Hosts UWB: on a tap, calls parties:join for that diner; FULL → tells the diner through Convex.
import SwiftUI

struct CheckInView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let store: PartyStore
    @State private var proximity = Proximity.shared

    private var members: [Member] { store.party?.members ?? [] }

    var body: some View {
        ScrollView {
            let layout = verticalSizeClass == .compact
                ? AnyLayout(HStackLayout(alignment: .top, spacing: 24))
                : AnyLayout(VStackLayout(spacing: 20))
            layout {
                VStack(spacing: 12) {
                    Text("\(members.count) of \(Int(store.party?.size ?? 0)) checked in")
                        .font(AppTypography.custom(32, relativeTo: .largeTitle, weight: .bold)).contentTransition(.numericText())
                    Text("Hold your phone to this one").foregroundStyle(Theme.accent)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 8) {
                        ForEach(members) { m in
                            VStack(spacing: 0) {
                                Text(m.name).font(AppTypography.style(.body, weight: .semibold))
                                AvatarView(avatarId: m.avatarId, size: 104, state: store.lastError == nil ? .celebrating : .confused,
                                           interactive: true)
                            }
                            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
                        }
                    }
                    .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(duration: 0.4, bounce: 0.5), value: members.count)
                }
                .frame(maxWidth: .infinity)
                VStack(spacing: 8) {
                    if let code = store.party?.joinCode {
                        QRImage(joinCode: code).frame(width: 110, height: 110)
                        Text(code).font(AppTypography.caption)
                    }
                    if let mock = app.mock { Button("Simulate tap") { mock.simulateTap() }.font(AppTypography.footnote) }
                    Button("Start with fewer") { Task { await store.startWithFewer() } }
                        .buttonStyle(.borderedProminent).foregroundStyle(Theme.accentForeground).disabled(members.count < 2)
                }
            }
            .padding()
        }
        .onChange(of: members.count) { old, new in if new > old { UINotificationFeedbackGenerator().notificationOccurred(.success) } }
        .onChange(of: members.map(\.userId)) { old, new in
            for userId in Set(old).subtracting(new) { proximity.forgetDiner(userId) }
        }
        .task(id: store.partyId) {
            proximity.startHosting(partyId: store.partyId, hostDeviceId: app.deviceId, backend: app.backend) { userId in
                Task {
                    if let error = await store.admit(userId: userId, via: .uwb) {
                        proximity.reject(userId: userId, reason: error.userMessage)
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
            Text("Everyone's here!").font(AppTypography.style(.largeTitle, weight: .bold))
            Text("Choosing hunger levels…").foregroundStyle(Theme.accent)
            MemberTicks(members: store.party?.members ?? []) { $0.hunger != nil }
            Spacer()
        }
    }
}
