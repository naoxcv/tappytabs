// Owner: Role 2. Diner check-in. States: searching → connected ("hold your phone to the restaurant phone")
// → tapped (instant buzz + animation) → joined (my userId appears in parties:current) → hand off: app.partyId.
// QR is always available; promoted to primary after 5 s with no restaurant, or 3 s after a tap that didn't join.
import Combine
import SwiftUI

struct TapInView: View {
    @Environment(AppModel.self) private var app
    @Binding var pendingJoinCode: String?
    @State private var proximity = Proximity.shared
    @State private var discoveredPartyId: String?
    @State private var showScanner = false
    @State private var promoteQR = false
    @State private var message: String?
    @State private var watch: AnyCancellable?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            ZStack {
                Circle().stroke(Theme.accent.opacity(0.3), lineWidth: 2).frame(width: 220, height: 220)
                    .scaleEffect(proximity.state == .connected ? 1.15 : 1)
                    .animation(.easeInOut(duration: 1).repeatForever(), value: proximity.state)
                Image(systemName: proximity.state == .tapped ? "checkmark.circle.fill" : "iphone.radiowaves.left.and.right")
                    .font(.system(size: 80)).foregroundStyle(Theme.accent)
                    .symbolEffect(.bounce, value: proximity.state == .tapped)
            }
            Text(title).font(.title2.bold()).multilineTextAlignment(.center)
            if let message { Text(message).foregroundStyle(.red) }
            if !proximity.supportsTap { Text("This phone can't tap, use QR").foregroundStyle(.secondary) }
            Spacer()
            if promoteQR || !proximity.supportsTap {
                Button("Scan QR") { showScanner = true }.buttonStyle(BigButtonStyle())
            } else {
                Button("Scan QR instead") { showScanner = true }
            }
            if let mock = app.mock {
                Button("Simulate tap (mock)") { Task { await simulatedJoin(mock) } }.font(.footnote)
            }
        }
        .padding()
        .sheet(isPresented: $showScanner) {
            QRScannerView { code in showScanner = false; Task { await joinByCode(code) } }.ignoresSafeArea()
        }
        .task { start() }
        .task { try? await Task.sleep(for: .seconds(5)); if proximity.state == .searching { promoteQR = true } }
        .onChange(of: pendingJoinCode) { _, code in if let code { Task { await joinByCode(code) } } }
        .onDisappear { proximity.stop(); watch = nil }
    }

    private var title: String {
        switch proximity.state {
        case .idle, .searching: "Looking for the restaurant…"
        case .connected: "Hold your phone to the restaurant phone"
        case .tapped: "Tapped! Joining…"
        case .rejected(let reason): reason
        }
    }

    private func start() {
        guard let userId = app.userId else { return }
        if let code = pendingJoinCode { Task { await joinByCode(code) }; return }
        proximity.startDinerTapIn(userId: userId, onConnected: { partyId in
            discoveredPartyId = partyId
            watchForMembership(partyId)
        }, onTapped: {
            Task { try? await Task.sleep(for: .seconds(3)); if app.partyId == nil { promoteQR = true } }
        }, onRejected: { reason in message = reason })
    }

    /// The restaurant phone calls parties:join after it sees the tap; we just wait to appear in the party.
    private func watchForMembership(_ partyId: String) {
        guard let userId = app.userId else { return }
        watch = app.backend.party(partyId).replaceError(with: nil).sink { party in
            if party?.member(userId) != nil { proximity.stop(); app.partyId = partyId }
        }
    }

    private func joinByCode(_ code: String) async {
        pendingJoinCode = nil
        guard let userId = app.userId else { return }
        do {
            let r = try await app.backend.join(partyId: nil, joinCode: code, userId: userId, via: .qr, hostDeviceId: nil, deviceId: app.deviceId)
            proximity.stop()
            app.partyId = r.partyId
        } catch {
            message = TTError.from(error).userMessage
        }
    }

    private func simulatedJoin(_ mock: MockBackend) async {
        guard let userId = app.userId else { return }
        _ = try? await mock.createParty(restaurantId: MockBackend.restaurantId, size: 4, hostDeviceId: mock.ids.hostDeviceId)
        _ = try? await mock.join(partyId: nil, joinCode: nil, userId: userId, via: .sim, hostDeviceId: mock.ids.hostDeviceId, deviceId: nil)
        for _ in 0..<3 { mock.simulateTap() }
        proximity.stop()
        app.partyId = mock.ids.partyId
    }
}
