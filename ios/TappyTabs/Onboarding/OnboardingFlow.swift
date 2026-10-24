// Owner: Role 2. Onboarding under 90 s: basics → allergies/diet → spice → swipe deck → follow-ups → avatar → summary.
// Ends with users:upsert + users:summarize, then saves app.userId (the hand-off to Role 1).
import SwiftUI

struct OnboardingCard: Decodable, Identifiable, Equatable {
    let name: String
    let emoji: String
    let category: String
    let cuisine: String
    let tags: [String]
    var id: String { name }
}

@Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable { case basics, allergies, spice, swipe, followups, avatar, summary }
    var step: Step = .basics
    var draft = DraftProfile()
    var questions: [FollowUpQuestion] = []
    var answers: [String: String] = [:]
    var summary: ProfileSummary?
    var error: String?

    func next() { step = Step(rawValue: step.rawValue + 1) ?? .summary }
    func back() { step = Step(rawValue: step.rawValue - 1) ?? .basics }

    func swipe(_ card: OnboardingCard, liked: Bool) {
        if liked {
            draft.likes = Array(Set(draft.likes + card.tags)).sorted()
            if !draft.cuisines.contains(card.cuisine) { draft.cuisines.append(card.cuisine) }
            if !draft.likedCategories.contains(card.category) { draft.likedCategories.append(card.category) }
        } else {
            draft.dislikes = Array(Set(draft.dislikes + card.tags).subtracting(draft.likes)).sorted()
        }
    }
}

struct OnboardingFlow: View {
    @Environment(AppModel.self) private var app
    @State private var model = OnboardingModel()

    var body: some View {
        VStack(spacing: 0) {
            ProgressView(value: Double(model.step.rawValue + 1), total: Double(OnboardingModel.Step.allCases.count))
                .padding(.horizontal)
            Group {
                switch model.step {
                case .basics: BasicsStep(model: model)
                case .allergies: AllergyDietStep(model: model)
                case .spice: SpiceStep(model: model)
                case .swipe: SwipeDeckStep(model: model)
                case .followups: FollowUpStep(model: model)
                case .avatar: AvatarPickerStep(model: model)
                case .summary: ProfileSummaryStep(model: model)
                }
            }
            .padding()
            .frame(maxHeight: .infinity)
            .transition(.push(from: .trailing))
            .animation(.easeInOut, value: model.step)
        }
    }
}

private struct StepScaffold<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    var nextTitle = "Next"
    var canContinue = true
    let onNext: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.largeTitle.bold())
            if let subtitle { Text(subtitle).foregroundStyle(.secondary) }
            content.frame(maxHeight: .infinity, alignment: .top)
            Button(nextTitle, action: onNext).buttonStyle(BigButtonStyle()).disabled(!canContinue)
        }
    }
}

struct BasicsStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Hi! What's your name?", canContinue: !model.draft.name.trimmingCharacters(in: .whitespaces).isEmpty, onNext: model.next) {
            TextField("First name", text: $model.draft.name).font(.title2).textFieldStyle(.roundedBorder).textContentType(.givenName)
        }
    }
}

struct AllergyDietStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Allergies & diet", subtitle: "Hard rules: your agent will never break these.", onNext: model.next) {
            ScrollView {
                VStack(alignment: .leading) {
                    Text("Allergies").font(.headline)
                    FlowChips(all: Allergen.allCases, label: \.label, selected: $model.draft.allergies)
                    Text("Diet").font(.headline).padding(.top)
                    FlowChips(all: Diet.allCases, label: \.label, selected: $model.draft.diet)
                }
            }
        }
    }
}

struct FlowChips<T: Hashable & Identifiable>: View {
    let all: [T]
    let label: KeyPath<T, String>
    @Binding var selected: Set<T>
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))], alignment: .leading) {
            ForEach(all) { item in
                let on = selected.contains(item)
                Button { if on { selected.remove(item) } else { selected.insert(item) } } label: {
                    Text(item[keyPath: label]).frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(on ? Theme.accent : Theme.card, in: Capsule())
                        .foregroundStyle(on ? .white : .primary)
                }.buttonStyle(.plain)
            }
        }
    }
}

struct SpiceStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "How much spice?", onNext: model.next) {
            VStack(spacing: 24) {
                Text(String(repeating: "🌶️", count: Int(model.draft.spice) + 1)).font(.system(size: 44))
                Slider(value: $model.draft.spice, in: 0...4, step: 1)
                Text(["None", "Mild", "Medium", "Hot", "Bring it"][Int(model.draft.spice)]).font(.title3)
            }.padding(.top, 40)
        }
    }
}

struct SwipeDeckStep: View {
    var model: OnboardingModel
    @State private var cards: [OnboardingCard] = Fixtures.load("OnboardingCards")
    @State private var offset: CGSize = .zero

    var body: some View {
        StepScaffold(title: "Swipe what you like", subtitle: "Right = yum, left = nope", nextTitle: cards.isEmpty ? "Next" : "Skip the rest", onNext: model.next) {
            ZStack {
                if cards.isEmpty { Text("All done!").font(.title) }
                ForEach(cards.reversed()) { card in
                    let top = card == cards.first
                    VStack(spacing: 8) {
                        Text(card.emoji).font(.system(size: 90))
                        Text(card.name).font(.title.bold())
                        Text(card.tags.joined(separator: " · ")).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 320)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 24))
                    .overlay(alignment: .topLeading) {
                        if top && offset.width > 40 { Text("YUM").font(.title.bold()).foregroundStyle(.green).padding() }
                    }
                    .overlay(alignment: .topTrailing) {
                        if top && offset.width < -40 { Text("NOPE").font(.title.bold()).foregroundStyle(.red).padding() }
                    }
                    .offset(top ? offset : .zero)
                    .rotationEffect(.degrees(top ? Double(offset.width / 20) : 0))
                    .gesture(top ? DragGesture()
                        .onChanged { offset = $0.translation }
                        .onEnded { g in
                            if abs(g.translation.width) > 100 { decide(card, liked: g.translation.width > 0) }
                            else { withAnimation(.spring) { offset = .zero } }
                        } : nil)
                }
            }
            HStack {
                Button { if let c = cards.first { decide(c, liked: false) } } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 52)) }.tint(.red)
                Spacer()
                Button { if let c = cards.first { decide(c, liked: true) } } label: { Image(systemName: "heart.circle.fill").font(.system(size: 52)) }.tint(.green)
            }.padding(.horizontal, 40).disabled(cards.isEmpty)
        }
    }

    private func decide(_ card: OnboardingCard, liked: Bool) {
        model.swipe(card, liked: liked)
        withAnimation(.spring) {
            offset = .zero
            cards.removeFirst()
        }
        if cards.isEmpty { model.next() }
    }
}

struct FollowUpStep: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: OnboardingModel
    @State private var loading = true

    var body: some View {
        StepScaffold(title: "A couple more", subtitle: "Your agent asked these", onNext: model.next) {
            if loading { ProgressView("Thinking…") }
            ForEach(model.questions) { q in
                VStack(alignment: .leading) {
                    Text(q.question).font(.headline)
                    Picker(q.question, selection: Binding(get: { model.answers[q.id] ?? "" }, set: { model.answers[q.id] = $0 })) {
                        ForEach(q.options, id: \.self) { Text($0).tag($0) }
                    }.pickerStyle(.segmented)
                }
            }
        }
        .task {
            // Skip the step if Claude takes longer than 4 s.
            let draft = model.draft
            let backend = app.backend
            let result = await withTaskGroup(of: [FollowUpQuestion]?.self) { group in
                group.addTask { try? await backend.followups(draft: draft) }
                group.addTask { try? await Task.sleep(for: .seconds(4)); return nil }
                let first = await group.next() ?? nil
                group.cancelAll()
                return first
            }
            loading = false
            if let result, !result.isEmpty { model.questions = result } else { model.next() }
        }
    }
}

struct AvatarPickerStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Pick your agent", onNext: model.next) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 16) {
                ForEach(AvatarCatalog.ids, id: \.self) { id in
                    AvatarView(avatarId: id, size: 70, highlighted: model.draft.avatarId == id)
                        .onTapGesture { model.draft.avatarId = id }
                }
            }
        }
    }
}

struct ProfileSummaryStep: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: OnboardingModel
    @State private var saving = true
    @State private var userId: String?

    var body: some View {
        StepScaffold(title: "Meet your agent", nextTitle: "Let's eat", canContinue: userId != nil, onNext: { app.userId = userId }) {
            VStack(spacing: 16) {
                AvatarView(avatarId: model.draft.avatarId, size: 110, highlighted: true)
                if saving { ProgressView("Saving your profile…") }
                if let s = model.summary {
                    Text(s.personality.label).font(.caption.bold()).padding(6).background(Theme.accent.opacity(0.2), in: Capsule())
                    Text(s.profileSummary).multilineTextAlignment(.center)
                }
                if let e = model.error { Text(e).foregroundStyle(.red) }
            }
            .frame(maxWidth: .infinity)
        }
        .task {
            do {
                let id = try await app.backend.upsertUser(deviceId: app.deviceId, profile: model.draft)
                let answers = model.questions.compactMap { q in model.answers[q.id].map { FollowUpAnswer(id: q.id, question: q.question, answer: $0) } }
                model.summary = try? await app.backend.summarize(userId: id, answers: answers)
                userId = id
            } catch {
                model.error = TTError.from(error).userMessage
            }
            saving = false
        }
    }
}
