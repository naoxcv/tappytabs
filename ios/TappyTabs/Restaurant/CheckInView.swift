// Owner: Role 2. "2 of 4 checked in", avatars pop in with a haptic, small QR, "Start with fewer" at ≥ 2.
// Hosts UWB: on a tap, calls parties:join for that diner; FULL → tells the diner through Convex.
import SwiftUI

struct CheckInView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let store: PartyStore
    @State private var proximity = Proximity.shared
    @State private var agentFrames: [String: CGRect] = [:]

    private var members: [Member] { store.party?.members ?? [] }

    var body: some View {
        GeometryReader { screen in
            ZStack {
                ScrollView {
                    let layout = verticalSizeClass == .compact
                        ? AnyLayout(HStackLayout(alignment: .top, spacing: 24))
                        : AnyLayout(VStackLayout(spacing: 20))
                    layout {
                        VStack(spacing: 12) {
                            Text("\(members.count) of \(Int(store.party?.size ?? 0)) checked in")
                                .font(AppTypography.custom(32, relativeTo: .largeTitle, weight: .bold)).contentTransition(.numericText())
                            Text("Hold your phone to this one").foregroundStyle(Theme.accent)
                            let columnCount = verticalSizeClass == .compact ? 4 : 2
                            let slotHeight: CGFloat = verticalSizeClass == .compact ? 82 : 112
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: columnCount), spacing: 8) {
                                ForEach(members) { m in
                                    Color.clear
                                        .frame(maxWidth: .infinity)
                                        .frame(height: slotHeight)
                                        .background {
                                            GeometryReader { slot in
                                                Color.clear.preference(
                                                    key: CheckInAgentFramesKey.self,
                                                    value: [m.id: slot.frame(in: .named("checkinScreen"))]
                                                )
                                            }
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
                                .buttonStyle(CompactPrimaryButtonStyle()).disabled(members.count < 2)
                        }
                    }
                    .padding()
                }
                ForEach(members) { member in
                    if let frame = agentFrames[member.id] {
                        AgentPlayground(
                            avatarId: member.avatarId,
                            initialPosition: CGPoint(x: frame.midX, y: frame.midY),
                            state: store.lastError == nil ? .celebrating : .confused,
                            displayName: member.name,
                            characterScale: characterScale(for: frame, in: screen.size)
                        )
                        .frame(width: screen.size.width, height: screen.size.height)
                    }
                }
            }
            .coordinateSpace(name: "checkinScreen")
            .onPreferenceChange(CheckInAgentFramesKey.self) { agentFrames = $0 }
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

    private func characterScale(for slot: CGRect, in screen: CGSize) -> CGFloat {
        let baseSize = min(360, min(screen.width, screen.height) * 0.88)
        guard baseSize > 0 else { return 1 }
        return min(2.0 / 3.0, slot.width * 1.25 / baseSize)
    }
}

private struct CheckInAgentFramesKey: PreferenceKey {
    static let defaultValue: [String: CGRect] = [:]
    static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
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
