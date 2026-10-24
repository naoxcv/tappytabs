// Owner: Role 2. Triple-tap the logo to toggle. Live distance + consecutive-count per peer, and a threshold slider,
// used to tune TapConfig on the real demo phones (record readings at 5, 10, 15, 20 cm).
import SwiftUI

struct ProximityDebugOverlay: View {
    @State private var proximity = Proximity.shared
    @State private var thresholdBeforeEditing: Float?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("UWB debug · \(stateText)").font(.caption.bold())
            ForEach(Array(proximity.debugHistory.enumerated()), id: \.offset) { entry in
                Text(entry.element).font(.caption2.monospaced()).fixedSize(horizontal: false, vertical: true)
            }
            if !proximity.supportsTap { Text("No precise distance on this phone: QR only").font(.caption2).foregroundStyle(.red) }
            ForEach(proximity.nearbyTables) { table in
                Text("table \(table.partyId.suffix(6)): \(table.phase.rawValue)")
                    .font(.caption2.monospaced())
            }
            ForEach(proximity.debugDistances.keys.sorted(), id: \.self) { key in
                let d = proximity.debugDistances[key]
                Text("\(key.suffix(8)): \(d.map { String(format: "%.2f m", $0) } ?? "–") · \(proximity.debugTapCounts[key] ?? 0)/\(proximity.config.consecutive)")
                    .font(.caption2.monospaced())
            }
            HStack {
                Text(String(format: "threshold %.2f m", proximity.config.thresholdMetres)).font(.caption2)
                Slider(value: Binding(get: { Double(proximity.config.thresholdMetres) },
                                      set: { proximity.setThreshold(Float($0)) }), in: 0.05...0.5) { isEditing in
                    if isEditing {
                        thresholdBeforeEditing = proximity.config.thresholdMetres
                    } else {
                        if let previous = thresholdBeforeEditing, previous != proximity.config.thresholdMetres {
                            proximity.restartConnection()
                        }
                        thresholdBeforeEditing = nil
                    }
                }
            }
        }
        .padding(10)
        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 10))
        .foregroundStyle(.white)
        .padding()
    }

    private var stateText: String {
        switch proximity.state {
        case .idle: "idle"; case .searching: "searching"; case .preparing: "preparing"; case .connected: "connected"; case .tapped: "tapped"
        case .rejected(let r): "rejected: \(r)"
        }
    }
}
