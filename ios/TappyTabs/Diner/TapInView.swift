// Owner: Role 2. Diner check-in. Discovery and token exchange start automatically while the diner holds the phones together.
// → tapped (instant buzz + animation) → joined (my userId appears in parties:current) → hand off: app.partyId.
// QR is always available; promoted to primary after 5 s with no restaurant, or 3 s after a tap that didn't join.
import Combine
import SwiftUI

struct TapInView: View {
    @Environment(AppModel.self) private var app
    @Binding var pendingJoinCode: String?
    @State private var proximity = Proximity.shared
    @State private var showScanner = false
    @State private var promoteQR = false
    @State private var message: String?
    @State private var joiningByQR = false
    @State private var avatarId = "avatar_1"
    @State private var departing = false
    @State private var departurePartyId: String?
    @State private var simulatedPartyId: String?
    @State private var watches: [String: AnyCancellable] = [:]
    @State private var tableLabels: [String: String] = [:]

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
                    .opacity(departing ? 0 : 1)
            }
            .anchorPreference(key: TapIconBoundsKey.self, value: .bounds) { $0 }
            Text(title).font(AppTypography.style(.title2, weight: .bold)).multilineTextAlignment(.center)
            if proximity.inRangeTableCount > 0 {
                Text("\(proximity.inRangeTableCount) nearby table\(proximity.inRangeTableCount == 1 ? "" : "s") in UWB range")
                    .font(AppTypography.subheadline).foregroundStyle(Theme.accent)
            }
            if proximity.hasCapacityOverflow {
                Text("Too many tables to range at once. Choose the table shown on the restaurant phone.")
                    .font(AppTypography.footnote).multilineTextAlignment(.center)
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(proximity.nearbyTables) { table in
                            Button(tableLabels[table.partyId] ?? "Table \(table.partyId.suffix(6))") {
                                proximity.focus(on: table.partyId)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
            }
            if let message { Text(message).foregroundStyle(Theme.accent) }
            if joiningByQR { ProgressView("Joining table…") }
            if !proximity.supportsTap { Text("This phone can't tap, use QR").foregroundStyle(Theme.accent) }
            if (app.tapSearchPaused && simulatedPartyId == nil) || promoteQR || proximity.state == .tapped {
                Button(app.tapSearchPaused && simulatedPartyId == nil ? "Search for tables" : "Restart tap search") {
                    if app.tapSearchPaused && simulatedPartyId == nil { app.resumeTapSearch() }
                    else { app.leaveTable() }
                }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("restartTapSearch")
            }
            Spacer()
            if promoteQR || !proximity.supportsTap {
                Button("Scan QR") { showScanner = true }.buttonStyle(BigButtonStyle()).disabled(joiningByQR)
            } else {
                Button("Scan QR instead") { showScanner = true }.disabled(joiningByQR)
            }
            if let mock = app.mock {
                Button("Simulate tap (mock)") { Task { await simulatedJoin(mock) } }.font(AppTypography.footnote)
            }
        }
        .padding()
        .overlayPreferenceValue(TapIconBoundsKey.self) { source in
            GeometryReader { proxy in
                if departing {
                    let rect = source.map { proxy[$0] }
                        ?? CGRect(x: proxy.size.width / 2 - 100, y: proxy.size.height * 0.3, width: 200, height: 200)
                    AvatarFlight(
                        avatarId: avatarId,
                        from: CGPoint(x: rect.midX, y: rect.midY),
                        to: CGPoint(x: rect.midX, y: -104),
                        rotationDegrees: -90
                    ) {
                        finishDeparture()
                    }
                }
            }
            .allowsHitTesting(false)
        }
        .sheet(isPresented: $showScanner) {
            QRScannerView { code in showScanner = false; Task { await joinByCode(code) } }.ignoresSafeArea()
        }
        .task(id: app.tapAttemptID) { await loadAvatar(); start() }
        .task(id: app.tapAttemptID) {
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled && (proximity.state == .searching || proximity.state == .preparing) { promoteQR = true }
        }
        .onChange(of: pendingJoinCode) { _, code in if let code { Task { await joinByCode(code) } } }
        .onDisappear { proximity.stop(); watches = [:] }
    }

    private var title: String {
        if app.tapSearchPaused && simulatedPartyId == nil { return "You left the table" }
        return switch proximity.state {
        case .idle, .searching, .preparing, .connected: "Hold your phone to the restaurant phone"
        case .tapped: "Tapped! Joining…"
        case .rejected(let reason): reason
        }
    }

    private func start() {
        watches = [:]
        tableLabels = [:]
        message = nil
        promoteQR = false
        if app.tapSearchPaused { proximity.stop(); return }
        guard let userId = app.userId else { return }
        if let code = pendingJoinCode { Task { await joinByCode(code) }; return }
        proximity.startDinerTapIn(userId: userId, deviceId: app.deviceId, backend: app.backend, onTableDiscovered: { partyId in
            watchForMembership(partyId)
        }, onTableLost: { partyId in
            watches[partyId] = nil
            tableLabels[partyId] = nil
        }, onTapped: {
            let attemptID = app.tapAttemptID
            Task {
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled && app.tapAttemptID == attemptID && app.partyId == nil && proximity.state == .tapped {
                    promoteQR = true
                }
            }
        }, onRejected: { reason in message = reason })
    }

    /// The restaurant phone calls parties:join after it sees the tap; we just wait to appear in the party.
    private func watchForMembership(_ partyId: String) {
        guard let userId = app.userId else { return }
        let backend = app.backend
        let attemptID = app.tapAttemptID
        watches[partyId] = backend.party(partyId).replaceError(with: nil).sink { party in
            guard app.mode == .diner, app.userId == userId, app.backend === backend, app.tapAttemptID == attemptID,
                  app.partyId == nil, !joiningByQR else { return }
            if let party { tableLabels[partyId] = "Table \(party.joinCode)" }
            if party?.member(userId) != nil {
                if proximity.tappedPartyId == partyId || simulatedPartyId == partyId {
                    beginDeparture(to: partyId)
                } else {
                    proximity.stop()
                    app.partyId = partyId
                }
            }
        }
    }

    private func loadAvatar() async {
        guard let profile = try? await app.backend.me(deviceId: app.deviceId) else { return }
        avatarId = profile.avatarId
    }

    private func beginDeparture(to partyId: String) {
        guard !departing, departurePartyId != partyId else { return }
        departurePartyId = partyId
        app.tapAnimationInProgress = true
        departing = true
    }

    private func finishDeparture() {
        guard let partyId = departurePartyId, app.mode == .diner, app.partyId == nil,
              let userId = app.userId else { return }
        Task {
            try? await app.backend.completeTapAnimation(partyId: partyId, userId: userId, deviceId: app.deviceId)
            guard app.mode == .diner, app.partyId == nil, departurePartyId == partyId else { return }
            proximity.stop()
            app.tapAnimationInProgress = false
            app.partyId = partyId
            app.tapSearchPaused = false
        }
    }

    private func joinByCode(_ code: String) async {
        guard !joiningByQR else { return }
        pendingJoinCode = nil
        guard let userId = app.userId else { return }
        joiningByQR = true
        let backend = app.backend
        let deviceId = app.deviceId
        let attemptID = app.tapAttemptID
        proximity.stop()
        watches = [:]
        defer { joiningByQR = false }
        do {
            let r = try await backend.join(partyId: nil, joinCode: code, userId: userId, via: .qr, hostDeviceId: nil, deviceId: deviceId)
            guard app.mode == .diner, app.userId == userId, app.backend === backend, app.deviceId == deviceId,
                  app.tapAttemptID == attemptID, app.partyId == nil || app.partyId == r.partyId else { return }
            app.tapSearchPaused = false
            app.partyId = r.partyId
        } catch {
            guard app.mode == .diner, app.userId == userId, app.backend === backend, app.deviceId == deviceId,
                  app.tapAttemptID == attemptID, app.partyId == nil else { return }
            start()
            message = TTError.from(error).userMessage
        }
    }

    private func simulatedJoin(_ mock: MockBackend) async {
        guard let userId = app.userId else { return }
        simulatedPartyId = mock.ids.partyId
        app.tapSearchPaused = true
        _ = try? await mock.createParty(restaurantId: MockBackend.restaurantId, size: 4, hostDeviceId: mock.ids.hostDeviceId, autoMode: false)
        _ = try? await mock.join(partyId: nil, joinCode: nil, userId: userId, via: .sim, hostDeviceId: mock.ids.hostDeviceId, deviceId: nil)
        for _ in 0..<3 { mock.simulateTap() }
        proximity.stop()
        beginDeparture(to: mock.ids.partyId)
    }
}
