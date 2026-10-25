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
    var isMovingBackward = false
    var draft = DraftProfile()
    var questions: [FollowUpQuestion] = []
    var answers: [String: String] = [:]
    var remainingCards: [OnboardingCard] = Fixtures.load("OnboardingCards")
    var summary: ProfileSummary?
    var error: String?

    func next() {
        isMovingBackward = false
        step = Step(rawValue: step.rawValue + 1) ?? .summary
    }
    func back() {
        isMovingBackward = true
        let previous = Step(rawValue: step.rawValue - 1) ?? .basics
        step = previous == .followups && questions.isEmpty ? .swipe : previous
    }

    func swipe(_ card: OnboardingCard, liked: Bool) {
        if liked {
            draft.likes = Array(Set(draft.likes + card.tags).subtracting(draft.dislikes)).sorted()
            if !draft.cuisines.contains(card.cuisine) { draft.cuisines.append(card.cuisine) }
            draft.dislikedCuisines.removeAll { $0 == card.cuisine }
            if card.category != "cuisine", !draft.likedCategories.contains(card.category) {
                draft.likedCategories.append(card.category)
            }
        } else {
            draft.dislikes = Array(Set(draft.dislikes + card.tags).subtracting(draft.likes)).sorted()
            draft.likes.removeAll { card.tags.contains($0) }
            if card.category == "cuisine" {
                if !draft.dislikedCuisines.contains(card.cuisine) { draft.dislikedCuisines.append(card.cuisine) }
                draft.cuisines.removeAll { $0 == card.cuisine }
            }
        }
    }
}

struct OnboardingFlow: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var model = OnboardingModel()

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Button(action: model.back) {
                    Label("Back", systemImage: "chevron.left")
                        .font(AppTypography.style(.body, weight: .semibold))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.accent)
                .opacity(model.step == .basics ? 0 : 1)
                .disabled(model.step == .basics)
                .accessibilityHidden(model.step == .basics)
                ProgressView(value: Double(model.step.rawValue + 1), total: Double(OnboardingModel.Step.allCases.count))
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: model.step)
            }
            .padding(.horizontal)
            ZStack {
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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .id(model.step)
                .transition(pageTransition)
            }
            .frame(maxHeight: .infinity)
            .clipped()
            .animation(.easeInOut(duration: reduceMotion ? 0.15 : 0.35), value: model.step)
        }
    }

    private var pageTransition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        let distance: CGFloat = model.isMovingBackward ? -24 : 24
        return .asymmetric(
            insertion: .offset(x: distance).combined(with: .opacity),
            removal: .offset(x: -distance).combined(with: .opacity)
        )
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
            Text(title).font(AppTypography.style(.largeTitle, weight: .bold))
            if let subtitle { Text(subtitle).foregroundStyle(Theme.accent) }
            content.frame(maxHeight: .infinity, alignment: .top)
            Button(nextTitle, action: onNext).buttonStyle(BigButtonStyle()).disabled(!canContinue)
        }
    }
}

struct BasicsStep: View {
    @Bindable var model: OnboardingModel
    @FocusState private var nameFocused: Bool

    private var canContinue: Bool {
        !model.draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HStack(spacing: 0) {
                        ForEach(AvatarCatalog.ids, id: \.self) { id in
                            AvatarView(avatarId: id, size: 72)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .accessibilityHidden(true)

                    Text("What should we\ncall you?")
                        .font(AppTypography.custom(36, relativeTo: .largeTitle, weight: .bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("First name")
                            .font(AppTypography.style(.subheadline, weight: .semibold))
                        TextField("First name", text: $model.draft.name,
                                  prompt: Text("e.g. Amy").foregroundStyle(Theme.accent.opacity(0.45)))
                            .font(AppTypography.custom(22))
                            .foregroundStyle(Theme.accent)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 18)
                            .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18))
                            .overlay {
                                RoundedRectangle(cornerRadius: 18)
                                    .strokeBorder(Theme.accent.opacity(nameFocused ? 1 : 0.25), lineWidth: nameFocused ? 2 : 1)
                            }
                            .focused($nameFocused)
                            .textContentType(.givenName)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .submitLabel(.continue)
                            .onSubmit(continueOnboarding)
                    }
                }
                .padding(.vertical, 24)
                .frame(maxWidth: 480, alignment: .leading)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .center)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button("Continue", action: continueOnboarding)
                .buttonStyle(BigButtonStyle())
                .disabled(!canContinue)
                .padding(.top, 16)
                .background(Theme.background)
        }
    }

    private func continueOnboarding() {
        guard canContinue else { return }
        nameFocused = false
        model.next()
    }
}

struct AllergyDietStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Allergies & diet", subtitle: "Hard rules: your agent will never break these.", onNext: model.next) {
            ScrollView {
                VStack(alignment: .leading) {
                    Text("Allergies").font(AppTypography.headline)
                    FlowChips(all: Allergen.allCases, label: \.label, selected: $model.draft.allergies)
                    Text("Diet").font(AppTypography.headline).padding(.top)
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
                        .foregroundStyle(on ? Theme.accentForeground : Theme.accent)
                }.buttonStyle(.plain)
            }
        }
    }
}

struct SpiceStep: View {
    @Bindable var model: OnboardingModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let level = Int(model.draft.spice)
        let labels = ["None", "Mild", "Medium", "Hot", "Bring it"]
        StepScaffold(title: "How much spice?", onNext: model.next) {
            VStack(spacing: 24) {
                ZStack {
                    ZStack {
                        ForEach(0...4, id: \.self) { index in
                            Image("spice_layer_\(index)")
                                .renderingMode(.original)
                                .resizable()
                                .scaledToFit()
                                .blendMode(.plusLighter)
                                .opacity(index == level ? 1 : 0)
                        }
                    }
                    .drawingGroup()
                    Image("spice_hat")
                        .renderingMode(.original)
                        .resizable()
                        .scaledToFit()
                }
                .frame(width: 180, height: 180)
                .animation(.easeInOut(duration: reduceMotion ? 0.1 : 0.18), value: level)
                .phaseAnimator([false, true], trigger: level) { content, lifted in
                    content.offset(y: !reduceMotion && lifted ? -4 : 0)
                } animation: { _ in
                    reduceMotion ? nil : .spring(duration: 0.12, bounce: 0.15)
                }
                .accessibilityHidden(true)
                Slider(value: $model.draft.spice, in: 0...4, step: 1)
                    .accessibilityLabel("Spice tolerance")
                    .accessibilityValue(labels[level])
                Text(labels[level]).font(AppTypography.custom(20))
            }.padding(.top, 40)
        }
    }
}

struct SwipeDeckStep: View {
    @Bindable var model: OnboardingModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var offset: CGSize = .zero
    @State private var deciding = false
    @State private var decisionTask: Task<Void, Never>?

    private var cards: [OnboardingCard] { model.remainingCards }
    private static let totalCount: Int = {
        let allCards: [OnboardingCard] = Fixtures.load("OnboardingCards")
        return allCards.count
    }()

    var body: some View {
        StepScaffold(title: "Which cuisines do you enjoy?",
                     nextTitle: cards.isEmpty ? "Next" : "Skip the rest", canContinue: !deciding, onNext: model.next) {
            GeometryReader { geometry in
                let photoHeight = max(140, min(240, geometry.size.height - 220))
                ScrollView {
                    VStack(spacing: 16) {
                        Text("\(min(Self.totalCount, Self.totalCount - cards.count + 1)) of \(Self.totalCount) cuisines")
                            .font(AppTypography.caption)
                        ZStack {
                            if cards.isEmpty {
                                VStack(spacing: 12) {
                                    Image(systemName: "checkmark.circle").font(.system(size: 40))
                                    Text("Your tastes are saved").font(AppTypography.headline)
                                }
                                .frame(maxWidth: .infinity, minHeight: photoHeight + 110)
                                .background(Theme.card, in: RoundedRectangle(cornerRadius: 24))
                            }
                            ForEach(Array(cards.prefix(2).reversed())) { card in
                                let top = card == cards.first
                                CuisineSwipeCard(card: card, photoHeight: photoHeight)
                                    .overlay(alignment: offset.width > 0 ? .topLeading : .topTrailing) {
                                        if top && abs(offset.width) > 35 {
                                            Text(offset.width > 0 ? "SOUNDS GOOD" : "SKIP")
                                                .font(AppTypography.style(.caption, weight: .bold))
                                                .padding(.horizontal, 12).padding(.vertical, 8)
                                                .foregroundStyle(Theme.accentForeground)
                                                .background(Theme.accent, in: Capsule())
                                                .padding(16)
                                        }
                                    }
                                    .scaleEffect(top ? 1 : 0.97, anchor: .bottom)
                                    .offset(top ? offset : CGSize(width: 0, height: 8))
                                    .rotationEffect(.degrees(top && !reduceMotion ? max(-12, min(12, Double(offset.width / 30))) : 0))
                                    .zIndex(top ? 1 : 0)
                                    .accessibilityHidden(!top)
                                    .allowsHitTesting(top && !deciding)
                                    .simultaneousGesture(top ? DragGesture(minimumDistance: 15)
                                        .onChanged { gesture in
                                            guard !deciding, abs(gesture.translation.width) > abs(gesture.translation.height) else { return }
                                            offset = CGSize(width: gesture.translation.width, height: gesture.translation.height * 0.12)
                                        }
                                        .onEnded { gesture in
                                            if abs(gesture.translation.width) > 100 && abs(gesture.translation.width) > abs(gesture.translation.height) {
                                                decide(card, liked: gesture.translation.width > 0, travel: geometry.size.width + 80)
                                            } else {
                                                withAnimation(reduceMotion ? nil : .spring(duration: 0.3)) { offset = .zero }
                                            }
                                        } : nil)
                            }
                        }
                        .padding(.bottom, 8)
                        HStack(spacing: 32) {
                            Button {
                                if let card = cards.first { decide(card, liked: false, travel: geometry.size.width + 80) }
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(Theme.accent)
                                    .frame(width: 60, height: 60)
                                    .background(Theme.card, in: Circle())
                                    .overlay(Circle().strokeBorder(Theme.accent.opacity(0.35)))
                                    .contentShape(Circle())
                            }
                            .accessibilityLabel("Skip cuisine")
                            Button {
                                if let card = cards.first { decide(card, liked: true, travel: geometry.size.width + 80) }
                            } label: {
                                Image(systemName: "heart.fill")
                                    .font(.system(size: 24))
                                    .foregroundStyle(Theme.accentForeground)
                                    .frame(width: 60, height: 60)
                                    .background(Theme.accent, in: Circle())
                                    .contentShape(Circle())
                            }
                            .accessibilityLabel("Like cuisine")
                        }
                        .buttonStyle(.plain)
                        .disabled(cards.isEmpty || deciding)
                    }
                    .frame(maxWidth: 480)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 8)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .onDisappear { decisionTask?.cancel() }
    }

    private func decide(_ card: OnboardingCard, liked: Bool, travel: CGFloat) {
        guard !deciding, cards.first?.id == card.id else { return }
        deciding = true
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.18)) {
            offset = reduceMotion ? .zero : CGSize(width: liked ? travel : -travel, height: -16)
        }
        decisionTask = Task { @MainActor in
            if !reduceMotion {
                do { try await Task.sleep(for: .milliseconds(180)) }
                catch { deciding = false; return }
            }
            guard !Task.isCancelled, model.step == .swipe, cards.first?.id == card.id else { deciding = false; return }
            model.swipe(card, liked: liked)
            var transaction = Transaction(animation: nil)
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                model.remainingCards.removeFirst()
                offset = .zero
                deciding = false
            }
            if cards.isEmpty { model.next() }
        }
    }
}

private struct CuisineSwipeCard: View {
    let card: OnboardingCard
    let photoHeight: CGFloat

    private var caption: String {
        switch card.cuisine {
        case "Thai": "Pad Thai, curries, fragrant herbs"
        case "Italian": "Pasta, pizza, rich tomato sauces"
        case "Japanese": "Ramen, sushi, comforting bowls"
        case "Mexican": "Tacos, salsas, bold flavors"
        case "Mediterranean": "Falafel, pita, fresh vegetables"
        default: card.tags.joined(separator: " · ")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            GeometryReader { geometry in
                Image("cuisine_\(card.cuisine.lowercased())")
                    .renderingMode(.original)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: photoHeight)
                    .clipped()
            }
            .frame(height: photoHeight)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text(card.name).font(AppTypography.style(.title, weight: .bold))
                Text(caption).font(AppTypography.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(Theme.accent)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 24))
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
                    Text(q.question).font(AppTypography.headline)
                    Picker(q.question, selection: Binding(get: { model.answers[q.id] ?? "" }, set: { model.answers[q.id] = $0 })) {
                        ForEach(q.options, id: \.self) { Text($0).tag($0) }
                    }.pickerStyle(.segmented)
                }
            }
        }
        .task {
            // Skip the step if Claude takes longer than 4 s.
            if model.isMovingBackward && !model.questions.isEmpty {
                loading = false
                return
            }
            let draft = model.draft
            let backend = app.backend
            let result = await withTaskGroup(of: [FollowUpQuestion]?.self) { group in
                group.addTask { try? await backend.followups(draft: draft) }
                group.addTask { try? await Task.sleep(for: .seconds(4)); return nil }
                let first = await group.next() ?? nil
                group.cancelAll()
                return first
            }
            guard !Task.isCancelled, model.step == .followups else { return }
            loading = false
            if let result, !result.isEmpty { model.questions = result } else { model.next() }
        }
    }
}

struct AvatarPickerStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Pick your agent", onNext: model.next) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 12)], spacing: 12) {
                ForEach(AvatarCatalog.ids, id: \.self) { id in
                    let selected = AvatarCatalog.character(model.draft.avatarId) == AvatarCatalog.character(id)
                    Button {
                        model.draft.avatarId = id
                    } label: {
                        AvatarView(avatarId: id, size: 80, highlighted: selected)
                            .allowsHitTesting(false)
                            .frame(maxWidth: .infinity, minHeight: 100)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                            .overlay {
                                RoundedRectangle(cornerRadius: 16)
                                    .strokeBorder(selected ? AvatarCatalog.color(id) : .clear, lineWidth: 2)
                            }
                            .overlay(alignment: .topTrailing) {
                                if selected {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(AvatarCatalog.color(id))
                                        .padding(6)
                                }
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("agent-picker-\(id)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }
}

private struct AgentStartAnchor: PreferenceKey {
    static var defaultValue: Anchor<CGRect>? { nil }
    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = nextValue() ?? value
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
                Color.clear.frame(height: 328)
                    .anchorPreference(key: AgentStartAnchor.self, value: .bounds) { $0 }
                    .accessibilityHidden(true)
                if saving { ProgressView("Saving your profile…") }
                if let s = model.summary {
                    Text(s.personality.label).font(AppTypography.style(.caption, weight: .bold)).padding(6).background(Theme.accent.opacity(0.2), in: Capsule())
                    Text(s.profileSummary).multilineTextAlignment(.center)
                }
                if let e = model.error { Text(e).foregroundStyle(Theme.accent) }
            }
            .frame(maxWidth: .infinity)
        }
        .overlayPreferenceValue(AgentStartAnchor.self) { anchor in
            GeometryReader { geometry in
                if let anchor {
                    let frame = geometry[anchor]
                    AgentPlayground(avatarId: model.draft.avatarId,
                                    initialPosition: CGPoint(x: geometry.size.width / 2,
                                                             y: frame.midY + 16))
                }
            }
            .padding(.bottom, 70)
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
