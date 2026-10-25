// Owner: Role 1. Stage 1: rank 1 as a big card, ranks 2–3 smaller; the agent's drink below. Select → "Lock in".
import SwiftUI

struct PickView: View {
    let store: PartyStore
    @State private var selected: String?
    @State private var sending = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Your agent's picks").font(AppTypography.style(.largeTitle, weight: .bold))
                if let deadline = store.party?.pickDeadline { Countdown(deadlineMs: deadline, offsetMs: store.serverOffsetMs) }
                if store.mains.isEmpty { Text("Your agent couldn't find a safe main. Ask your server.").foregroundStyle(Theme.accent) }
                ForEach(store.mains) { c in
                    CandidateCard(candidate: c, big: c.rank == 1, selected: (selected ?? store.mains.first?.itemId) == c.itemId) { imageData in
                        Task { await store.cacheDishImage(c, pngData: imageData) }
                    }
                        .onTapGesture { selected = c.itemId }
                }
                if let drink = store.drink {
                    HStack {
                        Image(systemName: "cup.and.saucer.fill")
                        Text("Your agent added: \(drink.name)").font(AppTypography.subheadline)
                        Spacer()
                        PriceText(cents: drink.priceCents).font(AppTypography.subheadline)
                    }
                    .padding().background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
                    Text("You can remove it in the next step.").font(AppTypography.caption).foregroundStyle(Theme.accent)
                }
            }
            .padding()
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                guard let id = selected ?? store.mains.first?.itemId else { return }
                sending = true
                Task { await store.pick(id); UINotificationFeedbackGenerator().notificationOccurred(.success); sending = false }
            } label: { sending ? AnyView(ProgressView().tint(Theme.accentForeground)) : AnyView(Text("Lock in")) }
                .buttonStyle(BigButtonStyle())
                .disabled(store.mains.isEmpty || sending)
                .padding()
                .background(.bar)
        }
    }
}

struct CandidateCard: View {
    let candidate: Candidate
    let big: Bool
    let selected: Bool
    var onProcessedImage: (Data) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Spacer(minLength: 0)
                DishImageView(urlString: candidate.imageUrl,
                              isAlreadyProcessed: candidate.imageIsProcessed ?? false,
                              onProcessedImage: onProcessedImage)
                Spacer(minLength: 0)
            }
            HStack(alignment: .firstTextBaseline) {
                if big {
                    Text("TOP PICK")
                        .font(AppTypography.style(.caption2, weight: .bold))
                        .foregroundStyle(Theme.accentForeground)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Theme.accent, in: Capsule())
                }
                Spacer()
                PriceText(cents: candidate.priceCents).font(AppTypography.custom(big ? 20 : 17, weight: .bold))
            }
            Text(candidate.name).font(big ? AppTypography.style(.title, weight: .bold) : AppTypography.style(.title3, weight: .bold))
            Text(candidate.reason).font(AppTypography.subheadline).foregroundStyle(Theme.accent)
            if big { Text(candidate.description).font(AppTypography.footnote).foregroundStyle(Theme.accent) }
            if candidate.askServer { AskServerBadge() }
        }
        .padding(big ? 20 : 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.cardCornerRadius, style: .continuous).stroke(selected ? Theme.accent : .clear, lineWidth: 3))
    }
}

/// Seconds left until a server deadline, ticking with the server clock offset.
struct Countdown: View {
    let deadlineMs: Double
    let offsetMs: Double
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let left = max(0, Int((deadlineMs - (ctx.date.ms + offsetMs)) / 1000))
            Label("\(left)s left: then your agent decides", systemImage: "timer")
                .font(AppTypography.footnote).foregroundStyle(Theme.accent)
        }
    }
}
