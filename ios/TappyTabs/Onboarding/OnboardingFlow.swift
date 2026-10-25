// Fixed offline onboarding: basics → hard rules → spice → five pairs → decision style → avatar → editable summary.
import SwiftUI

private struct TasteOption {
    let title: String
    let restaurant: String
    let detail: String
}

private struct TastePair: Identifiable {
    let id: String
    let contrast: String
    let a: TasteOption
    let b: TasteOption
    var summaryA: String {
        switch contrast {
        case "texture": "crisp textures"
        case "richness": "lighter dishes"
        case "brightness": "mellow flavors"
        case "brothiness": "dry or seared preparations"
        case "boldness": "mild seasoning"
        default: "fresh herbs"
        }
    }
    var summaryB: String {
        switch contrast {
        case "texture": "tender textures"
        case "richness": "richer dishes"
        case "brightness": "bright or tangy flavors"
        case "brothiness": "brothy dishes"
        case "boldness": "bold seasoning"
        default: "smoky or charred flavors"
        }
    }
    static let all = [
        TastePair(id: "v2_dumpling_texture", contrast: "texture",
                  a: TasteOption(title: "Pan-fried pork soup buns", restaurant: "Dumpling Home",
                                 detail: "Juicy pork and hot broth inside a soft bun, pan-fried until the bottom is golden and crunches when you bite in."),
                  b: TasteOption(title: "Pork soup dumplings (xiao long bao)", restaurant: "Dumpling Home",
                                 detail: "The same juicy pork and broth, steamed in a thin, delicate wrapper. Soft all the way through.")),
        TastePair(id: "v2_kokkari_richness", contrast: "richness",
                  a: TasteOption(title: "Whole grilled fish", restaurant: "Kokkari",
                                 detail: "Sea bass grilled on the bone over charcoal, finished with olive oil, lemon, and an herb-and-caper dressing."),
                  b: TasteOption(title: "Moussaka", restaurant: "Kokkari",
                                 detail: "Baked layers of cinnamon-spiced lamb and eggplant under a thick, creamy yogurt béchamel.")),
        TastePair(id: "v2_turtle_brightness", contrast: "brightness",
                  a: TasteOption(title: "Fresh spring rolls", restaurant: "Turtle Tower",
                                 detail: "Shrimp, rice noodles, and lettuce rolled in soft rice paper, with a creamy dipping sauce. Cool and gentle."),
                  b: TasteOption(title: "Green papaya salad", restaurant: "Turtle Tower",
                                 detail: "Crunchy shredded green papaya tossed with lime, fish sauce, herbs, and peanuts. Zingy and tart.")),
        TastePair(id: "v2_tadich_brothiness", contrast: "brothiness",
                  a: TasteOption(title: "Pan-fried sand dabs", restaurant: "Tadich Grill",
                                 detail: "A delicate local flatfish, pan-fried until golden. A simple plate of fish."),
                  b: TasteOption(title: "Cioppino", restaurant: "Tadich Grill",
                                 detail: "San Francisco’s classic seafood stew: crab, prawns, clams, mussels, scallops, and white fish in a tomato broth, with garlic bread for dipping.")),
        TastePair(id: "v2_burma_boldness", contrast: "boldness",
                  a: TasteOption(title: "Rainbow salad", restaurant: "Burma Superstar",
                                 detail: "A lighter, refreshing toss of 22 ingredients, including four kinds of noodles and green papaya."),
                  b: TasteOption(title: "Tea leaf salad", restaurant: "Burma Superstar",
                                 detail: "Fermented tea leaves with crunchy peanuts and seeds, fried garlic, ground dried shrimp, lemon, and fish sauce. Deeply savory and earthy.")),
        TastePair(id: "v2_khao_char", contrast: "char",
                  a: TasteOption(title: "Beef larb (larb nuer)", restaurant: "Khao Tiew",
                                 detail: "Northeastern Thai minced beef tossed with lime, fish sauce, toasted rice, and fresh herbs. Bright and cool."),
                  b: TasteOption(title: "Pork pad see ew", restaurant: "Khao Tiew",
                                 detail: "Wide rice noodles seared in a very hot wok until the edges char, with pork and Chinese broccoli. Smoky and savory.")),
    ]
}

@Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable { case basics, allergies, spice, pairs, decision, avatar, summary }
    var step: Step = .basics
    var isMovingBackward = false
    var draft = DraftProfile()
    var error: String?

    func next() {
        isMovingBackward = false
        step = Step(rawValue: step.rawValue + 1) ?? .summary
    }
    func back() {
        isMovingBackward = true
        step = Step(rawValue: step.rawValue - 1) ?? .basics
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
                    case .pairs: PairStep(model: model)
                    case .decision: DecisionStep(model: model)
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

struct PairStep: View {
    @Bindable var model: OnboardingModel
    @State private var index = 0
    @State private var showTieBreaker = false

    var body: some View {
        let pair = TastePair.all[index]
        StepScaffold(title: "This or That", subtitle: index == 5 ? "Optional tie-breaker · Prices are hidden." : "\(index + 1) of 5 · Choose what sounds better. Prices are hidden.",
                     nextTitle: index == 4 ? "Continue" : "Skip this pair", onNext: {
                        model.draft.pairAnswers.removeValue(forKey: pair.id)
                        advance()
                     }) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Which sounds better to you?").font(AppTypography.headline)
                    optionChoice(pair.a, value: "a", pair: pair)
                    optionChoice(pair.b, value: "b", pair: pair)
                    HStack {
                        choice("Both", value: "both", pair: pair)
                        choice("Neither", value: "neither", pair: pair)
                    }
                }
            }
        }
        .alert("One more comparison?", isPresented: $showTieBreaker) {
            Button("Try it") { index = 5 }
            Button("Continue") { model.next() }
        } message: { Text("An optional fresh herbs versus smoky char question can sharpen your profile.") }
    }

    private func optionChoice(_ option: TasteOption, value: String, pair: TastePair) -> some View {
        Button {
            model.draft.pairAnswers[pair.id] = value
            advance()
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                Text(option.title).font(AppTypography.headline)
                Text(option.restaurant).font(AppTypography.caption)
                Text(option.detail).font(AppTypography.footnote).fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.leading)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(BigButtonStyle())
    }

    private func choice(_ title: String, value: String, pair: TastePair) -> some View {
        Button(title) {
            model.draft.pairAnswers[pair.id] = value
            advance()
        }
        .buttonStyle(BigButtonStyle())
    }

    private func advance() {
        if index < 4 { index += 1 }
        else if index == 4 { showTieBreaker = true }
        else { model.next() }
    }
}

struct DecisionStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Your decision style", onNext: model.next) {
            ScrollView { VStack(alignment: .leading, spacing: 24) {
                Text("How much should your agent favor lower-priced choices?").font(AppTypography.headline)
                Picker("Price preference", selection: $model.draft.priceSensitivity) {
                    Text("A lot").tag("a_lot")
                    Text("Somewhat").tag("somewhat")
                    Text("Not much").tag("not_much")
                }.pickerStyle(.segmented)
                Text("What feels more fun?").font(AppTypography.headline)
                Picker("Familiarity", selection: $model.draft.familiarity) {
                    Text("Familiar things").tag("familiar")
                    Text("Open to surprises").tag("open")
                }.pickerStyle(.segmented)
                Text("Any ingredients you especially like or avoid? Optional.").font(AppTypography.headline)
                TextField("Ingredients you like", text: Binding(
                    get: { model.draft.ingredientLikes.joined(separator: ", ") },
                    set: { model.draft.ingredientLikes = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
                )).textFieldStyle(.roundedBorder)
                TextField("Ingredients you avoid", text: Binding(
                    get: { model.draft.ingredientAvoids.joined(separator: ", ") },
                    set: { model.draft.ingredientAvoids = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
                )).textFieldStyle(.roundedBorder)
            } }
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
    @State private var saving = false

    private var supported: [TastePair] {
        TastePair.all.filter { pair in
            guard !model.draft.removedContrasts.contains(pair.contrast) else { return false }
            return ["a", "b"].contains(model.draft.pairAnswers[pair.id] ?? "") || model.draft.tasteCorrections[pair.contrast] != nil
        }
    }

    var body: some View {
        StepScaffold(title: "Your taste, so far", subtitle: "These are early guesses. Correct or remove anything that feels wrong.",
                     nextTitle: saving ? "Saving…" : "Let's eat", canContinue: !saving, onNext: { Task { await save() } }) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Color.clear.frame(height: 328)
                        .anchorPreference(key: AgentStartAnchor.self, value: .bounds) { $0 }
                        .accessibilityHidden(true)
                    ForEach(supported) { pair in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(statement(pair)).font(AppTypography.headline)
                            HStack {
                                Button("Other side") {
                                    let current = model.draft.tasteCorrections[pair.contrast] ?? (model.draft.pairAnswers[pair.id] == "b" ? 1.0 : -1.0)
                                    model.draft.tasteCorrections[pair.contrast] = -current
                                }
                                Button("Remove") {
                                    model.draft.removedContrasts.insert(pair.contrast)
                                    model.draft.tasteCorrections.removeValue(forKey: pair.contrast)
                                }
                            }.font(AppTypography.footnote)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                    }
                    if supported.isEmpty { Text("Your agent will start with the safety rules and learn your choices here.") }
                    Text("Price: \(model.draft.priceSensitivity.replacingOccurrences(of: "_", with: " ")) · \(model.draft.familiarity == "open" ? "Open to surprises" : "Familiar choices")")
                        .foregroundStyle(Theme.accent)
                    if let error = model.error { Text(error).foregroundStyle(.red) }
                }
            }
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
    }

    private func statement(_ pair: TastePair) -> String {
        let value = model.draft.tasteCorrections[pair.contrast] ?? (model.draft.pairAnswers[pair.id] == "b" ? 1.0 : -1.0)
        return "You may prefer \(value > 0 ? pair.summaryB : pair.summaryA)."
    }

    private func save() async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let id = try await app.backend.upsertUser(deviceId: app.deviceId, profile: model.draft)
            app.userId = id
        } catch {
            model.error = TTError.from(error).userMessage
        }
    }
}
