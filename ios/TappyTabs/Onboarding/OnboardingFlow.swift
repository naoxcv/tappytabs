// Fixed offline onboarding: basics → hard rules → spice → taste pairs → decision style → avatar → editable summary.
import SwiftUI

private struct TasteOption {
    let title: String
    let restaurant: String
    let detail: String
    let imageURL: URL
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
                                 detail: "Pork · broth · pan-fried bun",
                                 imageURL: URL(string: "https://s3-media0.fl.yelpcdn.com/bphoto/Utdv29yFK-sfp9D1Tg-Bwg/o.jpg")!),
                  b: TasteOption(title: "Pork soup dumplings (xiao long bao)", restaurant: "Dumpling Home",
                                 detail: "Pork · broth · steamed wrapper",
                                 imageURL: URL(string: "https://s.hdnux.com/photos/01/15/03/50/20199986/22/rawImage.jpg")!)),
        TastePair(id: "v2_kokkari_richness", contrast: "richness",
                  a: TasteOption(title: "Whole grilled fish", restaurant: "Kokkari",
                                 detail: "Sea bass · lemon · olive oil · herbs · capers",
                                 imageURL: URL(string: "https://s.hdnux.com/photos/54/11/64/15347683/3/premium_gallery_landscape.jpg")!),
                  b: TasteOption(title: "Moussaka", restaurant: "Kokkari",
                                 detail: "Lamb · beef · eggplant · potato · yogurt béchamel",
                                 imageURL: URL(string: "https://res.cloudinary.com/the-infatuation/image/upload/f_auto/q_auto/v1735838424/images/Kitchen_Istanbul_Moussaka_1_SF_Erin_Ng_thalzn.jpg")!)),
        TastePair(id: "v2_turtle_brightness", contrast: "brightness",
                  a: TasteOption(title: "Fresh spring rolls", restaurant: "Turtle Tower",
                                 detail: "Shrimp · pork · rice paper · peanut sauce",
                                 imageURL: URL(string: "https://i0.wp.com/vickypham.com/wp-content/uploads/2024/08/f67fd-img_9264.jpg?fit=2500%2C2500&ssl=1")!),
                  b: TasteOption(title: "Green papaya salad", restaurant: "Turtle Tower",
                                 detail: "Green papaya · peanuts · mint · cilantro",
                                 imageURL: URL(string: "https://res.cloudinary.com/the-infatuation/image/upload/f_auto/q_auto/v1748979274/images/Turtle_Tower_Nom_Du_Du_1_SF_ERIN_NG_h4trdy.jpg")!)),
        TastePair(id: "v2_tadich_brothiness", contrast: "brothiness",
                  a: TasteOption(title: "Pan-fried sand dabs", restaurant: "Tadich Grill",
                                 detail: "Sand dabs · pan-fried",
                                 imageURL: URL(string: "https://tadichgrillsf.com/wp-content/uploads/2018/06/PanFriedSandDabs.jpg")!),
                  b: TasteOption(title: "Cioppino", restaurant: "Tadich Grill",
                                 detail: "Crab · prawns · clams · mussels · scallops · tomato broth",
                                 imageURL: URL(string: "https://res.cloudinary.com/the-infatuation/image/upload/c_fill%2Cw_3840%2Car_4%3A3%2Cg_center%2Cf_auto/cms/reviews/tadich-grill/krescentcarasso-sf-tadichgrill-cioppinno-3")!)),
        TastePair(id: "v2_burma_boldness", contrast: "boldness",
                  a: TasteOption(title: "Rainbow salad", restaurant: "Burma Superstar",
                                 detail: "Four noodles · green papaya · 22 ingredients",
                                 imageURL: URL(string: "https://d1w7312wesee68.cloudfront.net/QgeDhn5ZxVSRfJKiJYj1UmCgCX0Lczjaa8TN5Q4gmtQ/resize%3Afit%3A720%3A720/plain/s3%3A/toasttab/menu_service/restaurants/6c10d02e-f0e4-459a-a0a2-65f8b4e01490/MenuItem/b404b6b1-30b5-4da4-806b-c07245f9571b.jpg")!),
                  b: TasteOption(title: "Tea leaf salad", restaurant: "Burma Superstar",
                                 detail: "Fermented tea leaves · peanuts · seeds · tomato · lime",
                                 imageURL: URL(string: "https://s.hdnux.com/photos/01/23/64/63/21974270/7/rawImage.jpg")!)),
    ]
}

@Observable
final class OnboardingModel {
    enum Step: Int, CaseIterable { case basics, allergies, spice, pairs, decision, summary, avatar, meetAgent }
    var step: Step = .basics
    var isMovingBackward = false
    var draft = DraftProfile()
    var error: String?

    func next() {
        isMovingBackward = false
        step = Step(rawValue: step.rawValue + 1) ?? .meetAgent
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
                    case .meetAgent: MeetAgentStep(model: model)
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
        .background {
            if model.step == .meetAgent {
                GeometryReader { geometry in
                    AgentPlayground(
                        avatarId: model.draft.avatarId,
                        initialPosition: CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
                    )
                    .frame(width: geometry.size.width, height: geometry.size.height)
                }
                .ignoresSafeArea()
            }
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
    var nextTitle: String? = "Next"
    var canContinue = true
    let onNext: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(AppTypography.style(.largeTitle, weight: .bold))
            if let subtitle { Text(subtitle).foregroundStyle(Theme.accent) }
            content.frame(maxHeight: .infinity, alignment: .top)
            if let nextTitle {
                Button(nextTitle, action: onNext).buttonStyle(BigButtonStyle()).disabled(!canContinue)
            }
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
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
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
        StepScaffold(title: "Allergies & diet", onNext: model.next) {
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

    var body: some View {
        let pair = TastePair.all[index]
        StepScaffold(title: "This or That", subtitle: "Chosen from popular restaurants near you.", nextTitle: nil, onNext: { model.next() }) {
            GeometryReader { geometry in
                let fixedHeight: CGFloat = 332 // card copy, buttons, and stack spacing
                let imageHeight = min(154, max(48, (geometry.size.height - fixedHeight) / 2))

                ZStack {
                    VStack(spacing: 12) {
                        optionChoice(pair.a, value: "a", pair: pair, imageHeight: imageHeight)
                        optionChoice(pair.b, value: "b", pair: pair, imageHeight: imageHeight)
                        Spacer(minLength: 0)
                        HStack(spacing: 12) {
                            choice("Both", value: "both", pair: pair)
                            choice("Neither", value: "neither", pair: pair)
                        }
                    }
                    .id(pair.id)
                    .transition(.asymmetric(
                        insertion: .offset(x: 24).combined(with: .opacity),
                        removal: .offset(x: -24).combined(with: .opacity)
                    ))
                }
                .padding(.horizontal, 2)
                .padding(.bottom, 8)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .animation(.easeInOut(duration: 0.3), value: pair.id)
            }
        }
    }

    private func optionChoice(_ option: TasteOption, value: String, pair: TastePair, imageHeight: CGFloat) -> some View {
        Button {
            model.draft.pairAnswers[pair.id] = value
            advance()
        } label: {
            AsyncImage(url: option.imageURL) { phase in
                optionCardContents(
                    option,
                    image: phase.image,
                    imageHeight: imageHeight,
                    isLoading: phase.image == nil && phase.error == nil
                )
            }
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(isSelected(value, pair: pair) ? Theme.accent : .clear, lineWidth: 2)
            }
            .overlay(alignment: .topTrailing) {
                if isSelected(value, pair: pair) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.accent)
                        .padding(8)
                        .background(.black.opacity(0.45), in: Circle())
                        .padding(8)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected(value, pair: pair) ? .isSelected : [])
    }

    private func optionCardContents(
        _ option: TasteOption,
        image: Image?,
        imageHeight: CGFloat,
        isLoading: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if let image {
                    image.resizable().scaledToFill().transition(.opacity)
                } else {
                    imageFallback.overlay {
                        if isLoading { ProgressView().tint(Theme.accent) }
                    }
                    .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: imageHeight)
            .clipped()

            VStack(alignment: .leading, spacing: 7) {
                Text(option.title).font(AppTypography.style(.title3, weight: .bold))
                Text(option.restaurant).font(AppTypography.caption).foregroundStyle(Theme.accent.opacity(0.72))
                Text(option.detail).font(AppTypography.subheadline).fixedSize(horizontal: false, vertical: true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(isLoading ? 0 : 1)
            .accessibilityHidden(isLoading)
            .overlay {
                if isLoading {
                    VStack(alignment: .leading, spacing: 9) {
                        RoundedRectangle(cornerRadius: 4).fill(Theme.accent.opacity(0.16)).frame(width: 170, height: 16)
                        RoundedRectangle(cornerRadius: 4).fill(Theme.accent.opacity(0.1)).frame(width: 90, height: 11)
                        RoundedRectangle(cornerRadius: 4).fill(Theme.accent.opacity(0.1)).frame(maxWidth: 210).frame(height: 12)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity)
                }
            }
        }
        .multilineTextAlignment(.leading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .animation(.easeInOut(duration: 0.25), value: isLoading)
    }

    private func choice(_ title: String, value: String, pair: TastePair) -> some View {
        Button(title) {
            model.draft.pairAnswers[pair.id] = value
            advance()
        }
        .buttonStyle(.plain)
        .font(AppTypography.style(.caption, weight: .semibold))
        .frame(maxWidth: .infinity, minHeight: 46)
        .foregroundStyle(Theme.primaryActionText)
        .background(Theme.primaryActionFill, in: Capsule())
        .overlay(Capsule().strokeBorder(isSelected(value, pair: pair) ? Theme.primaryActionText : .clear, lineWidth: 2))
        .accessibilityAddTraits(isSelected(value, pair: pair) ? .isSelected : [])
    }

    private func isSelected(_ value: String, pair: TastePair) -> Bool {
        model.draft.pairAnswers[pair.id] == value
    }

    private var imageFallback: some View {
        ZStack {
            Theme.card
            Image(systemName: "fork.knife")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(Theme.accent.opacity(0.55))
        }
    }

    private func advance() {
        if index < 4 { withAnimation(.easeInOut(duration: 0.3)) { index += 1 } }
        else { model.next() }
    }
}

struct DecisionStep: View {
    @Bindable var model: OnboardingModel
    var body: some View {
        StepScaffold(title: "Your decision style", onNext: model.next) {
            ScrollView { VStack(alignment: .leading, spacing: 24) {
                Text("How important is it for a meal to be affordable to you?").font(AppTypography.headline)
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
                Text("Any ingredients you especially like or avoid?").font(AppTypography.headline)
                TextField("Ingredients you like", text: Binding(
                    get: { model.draft.ingredientLikes.joined(separator: ", ") },
                    set: { model.draft.ingredientLikes = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
                )).appFieldStyle()
                TextField("Ingredients you avoid", text: Binding(
                    get: { model.draft.ingredientAvoids.joined(separator: ", ") },
                    set: { model.draft.ingredientAvoids = $0.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
                )).appFieldStyle()
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

struct ProfileSummaryStep: View {
    @Bindable var model: OnboardingModel

    private var supported: [TastePair] {
        TastePair.all.filter { pair in
            guard !model.draft.removedContrasts.contains(pair.contrast) else { return false }
            return ["a", "b"].contains(model.draft.pairAnswers[pair.id] ?? "") || model.draft.tasteCorrections[pair.contrast] != nil
        }
    }

    var body: some View {
        StepScaffold(title: "Your taste, so far", subtitle: "These are early guesses. Correct or remove anything that feels wrong.",
                     nextTitle: "Meet your agent", onNext: model.next) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
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
    }

    private func statement(_ pair: TastePair) -> String {
        let value = model.draft.tasteCorrections[pair.contrast] ?? (model.draft.pairAnswers[pair.id] == "b" ? 1.0 : -1.0)
        return "You may prefer \(value > 0 ? pair.summaryB : pair.summaryA)."
    }

}

struct MeetAgentStep: View {
    @Environment(AppModel.self) private var app
    @Bindable var model: OnboardingModel
    @State private var saving = false

    var body: some View {
        StepScaffold(
            title: "Meet your agent",
            subtitle: "Drag, tap, or press and hold to play.",
            nextTitle: saving ? "Saving…" : "Let's eat",
            canContinue: !saving,
            onNext: { Task { await save() } }
        ) {
            Spacer(minLength: 0)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .bottom) {
                    if let error = model.error {
                        Text(error)
                            .font(AppTypography.footnote)
                            .foregroundStyle(.red)
                            .padding(10)
                            .background(Theme.background.opacity(0.9), in: Capsule())
                            .padding(12)
                    }
                }
        }
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
