// Owner: Role 1. Backend over convex-swift. Rules:
//  - numbers are sent as Double; optional args are OMITTED (sending null fails Convex's v.optional)
//  - every publisher is delivered on the main queue
import Combine
import ConvexMobile
import Foundation

final class LiveBackend: Backend {
    let client: ConvexClient

    init(deploymentUrl: String) {
        client = ConvexClient(deploymentUrl: deploymentUrl)
    }

    // MARK: subscriptions

    private func sub<T: Decodable>(_ name: String, _ args: [String: ConvexEncodable?]) -> AnyPublisher<T, TTError> {
        client.subscribe(to: name, with: args, yielding: T.self)
            .mapError(TTError.from)
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    func party(_ partyId: String) -> AnyPublisher<Party?, TTError> { sub(API.partiesCurrent, ["partyId": partyId]) }
    func messages(_ partyId: String) -> AnyPublisher<MessagesPayload, TTError> { sub(API.messagesList, ["partyId": partyId]) }
    func candidates(_ partyId: String, userId: String) -> AnyPublisher<[Candidate], TTError> {
        sub(API.ordersCandidates, ["partyId": partyId, "userId": userId])
    }
    func lines(_ partyId: String) -> AnyPublisher<LinesPayload, TTError> { sub(API.ordersLines, ["partyId": partyId]) }
    func menuStatus(_ restaurantId: String) -> AnyPublisher<MenuStatus?, TTError> { sub(API.menuStatus, ["restaurantId": restaurantId]) }
    func addable(_ partyId: String, userId: String, shared: Bool) -> AnyPublisher<[AddableItem], TTError> {
        sub(API.ordersAddable, ["partyId": partyId, "userId": userId, "shared": shared])
    }
    func pendingTaps(partyId: String, hostDeviceId: String) -> AnyPublisher<[TapRequest], TTError> {
        sub(API.tapPending, ["partyId": partyId, "hostDeviceId": hostDeviceId])
    }
    func tapSession(partyId: String, userId: String, deviceId: String) -> AnyPublisher<TapSession?, TTError> {
        sub(API.tapSession, ["partyId": partyId, "userId": userId, "deviceId": deviceId])
    }
    func forUserUpdates(userId: String) -> AnyPublisher<HostedParty?, TTError> {
        sub(API.partiesForUser, ["userId": userId])
    }

    /// convex-swift has no one-shot query; take the first value of a subscription.
    private func once<T: Decodable>(_ name: String, _ args: [String: ConvexEncodable?]) async throws -> T {
        let publisher: AnyPublisher<T, TTError> = sub(name, args)
        for try await value in publisher.first().values { return value }
        throw TTError.network("No response from \(name)")
    }

    func me(deviceId: String) async throws -> UserProfile? { try await once(API.usersMe, ["deviceId": deviceId]) }
    func restaurants() async throws -> [RestaurantRef] { try await once(API.menuRestaurants, [:]) }
    func hosted(hostDeviceId: String) async throws -> HostedParty? { try await once(API.partiesHosted, ["hostDeviceId": hostDeviceId]) }
    func forUser(userId: String) async throws -> HostedParty? { try await once(API.partiesForUser, ["userId": userId]) }

    // MARK: mutations / actions

    private func mutate<T: Decodable>(_ name: String, _ args: [String: ConvexEncodable?]) async throws -> T {
        do { return try await client.mutation(name, with: args) } catch { throw TTError.from(error) }
    }
    private func mutate(_ name: String, _ args: [String: ConvexEncodable?]) async throws {
        do { try await client.mutation(name, with: args) } catch { throw TTError.from(error) }
    }
    private func act<T: Decodable>(_ name: String, _ args: [String: ConvexEncodable?]) async throws -> T {
        do { return try await client.action(name, with: args) } catch { throw TTError.from(error) }
    }

    private static func strings(_ xs: [String]) -> [ConvexEncodable?] { xs.map { $0 } }

    private static func profileArgs(_ p: DraftProfile) -> [String: ConvexEncodable?] {
        [
            "name": p.name,
            "allergies": strings(p.allergies.map(\.rawValue).sorted()),
            "diet": strings(p.diet.map(\.rawValue).sorted()),
            "spice": p.spice,
            "likes": strings(p.likes),
            "dislikes": strings(p.dislikes),
            "ingredientLikes": strings(p.ingredientLikes),
            "ingredientAvoids": strings(p.ingredientAvoids),
            "cuisines": strings(p.cuisines),
            "dislikedCuisines": strings(p.dislikedCuisines),
            "likedCategories": strings(p.likedCategories),
            "avatarId": p.avatarId,
            "pairAnswers": p.pairAnswers.sorted { $0.key < $1.key }.map { ["pairId": $0.key, "choice": $0.value] as [String: ConvexEncodable?] },
            "tasteCorrections": p.tasteCorrections.sorted { $0.key < $1.key }.map { ["contrast": $0.key, "value": $0.value] as [String: ConvexEncodable?] },
            "removedContrasts": strings(p.removedContrasts.sorted()),
            "priceSensitivity": p.priceSensitivity,
            "familiarity": p.familiarity,
        ]
    }

    func upsertUser(deviceId: String, profile: DraftProfile) async throws -> String {
        var args = Self.profileArgs(profile)
        args["deviceId"] = deviceId
        return try await mutate(API.usersUpsert, args)
    }

    func followups(draft: DraftProfile) async throws -> [FollowUpQuestion] {
        do { return try await act(API.usersFollowups, ["draft": Self.profileArgs(draft)]) } catch { throw TTError.from(error) }
    }

    func summarize(userId: String, answers: [FollowUpAnswer]) async throws -> ProfileSummary {
        let a: [ConvexEncodable?] = answers.map { ["id": $0.id, "question": $0.question, "answer": $0.answer] as [String: ConvexEncodable?] }
        return try await act(API.usersSummarize, ["userId": userId, "answers": a])
    }

    // MARK: Restaurant onboarding

    func restaurantAccount(deviceId: String, displayName: String) async throws -> RestaurantAccount {
        let _: String = try await mutate(API.restaurantAccountsCreateOrGet, ["deviceId": deviceId, "displayName": displayName])
        return try await once(API.restaurantOnboardingMe, ["deviceId": deviceId])
    }

    func createRestaurantDraft(deviceId: String, name: String, address: String) async throws -> String {
        try await mutate(API.restaurantCreateDraft, ["deviceId": deviceId, "name": name, "address": address])
    }

    func restaurantOnboardingStatus(deviceId: String, onboardingId: String) -> AnyPublisher<RestaurantOnboarding?, TTError> {
        sub(API.restaurantGetStatus, ["deviceId": deviceId, "onboardingId": onboardingId])
    }

    func startRestaurantUrlImport(deviceId: String, onboardingId: String, url: String, location: String?) async throws {
        var args: [String: ConvexEncodable?] = ["deviceId": deviceId, "onboardingId": onboardingId, "url": url]
        if let location { args["location"] = location }
        let _: RestaurantScrapeResult = try await act(API.restaurantStartUrlImport, args)
    }

    func startRestaurantSearch(deviceId: String, onboardingId: String, query: String, location: String) async throws {
        let _: RestaurantScrapeResult = try await act(API.restaurantStartSearch, ["deviceId": deviceId, "onboardingId": onboardingId, "query": query, "location": location])
    }

    private static func candidateArgs(_ c: RestaurantCandidate) -> [String: ConvexEncodable?] {
        var args: [String: ConvexEncodable?] = ["name": c.name, "address": c.address]
        if let value = c.sourceUrl { args["sourceUrl"] = value }
        if let value = c.mapsUrl { args["mapsUrl"] = value }
        if let value = c.googlePlaceId { args["googlePlaceId"] = value }
        if let value = c.websiteUrl { args["websiteUrl"] = value }
        if let value = c.phone { args["phone"] = value }
        if let value = c.hours { args["hours"] = strings(value) }
        if let value = c.rating { args["rating"] = value }
        if let value = c.distance { args["distance"] = value }
        if let value = c.matchScore { args["matchScore"] = value }
        return args
    }

    func selectRestaurantCandidate(deviceId: String, onboardingId: String, candidate: RestaurantCandidate) async throws {
        try await mutate(API.restaurantSelectCandidate, ["deviceId": deviceId, "onboardingId": onboardingId, "candidate": Self.candidateArgs(candidate)])
    }

    func restaurantDraft(deviceId: String, onboardingId: String) async throws -> RestaurantMenuDraft? {
        try await once(API.restaurantGetDraft, ["deviceId": deviceId, "onboardingId": onboardingId])
    }

    private static func menuItemArgs(_ item: RestaurantMenuItem) -> [String: ConvexEncodable?] {
        let allergens: [ConvexEncodable?] = item.allergens.map { values in
            values.reduce(into: [String: ConvexEncodable?]()) { result, pair in result[pair.key] = pair.value }
        }
        var args: [String: ConvexEncodable?] = [
            "name": item.name, "category": item.category, "tags": strings(item.tags), "description": item.description,
            "priceCents": item.priceCents, "allergens": allergens, "diet": strings(item.diet), "spice": item.spice,
            "isDrink": item.isDrink, "shareable": item.shareable, "menuOrder": item.menuOrder, "tagStatus": item.tagStatus,
        ]
        if let cuisine = item.cuisine { args["cuisine"] = cuisine }
        if let imageUrl = item.imageUrl { args["imageUrl"] = imageUrl }
        return args
    }

    private static func menuItemsArgs(_ items: [RestaurantMenuItem]) -> [ConvexEncodable?] { items.map { menuItemArgs($0) } }

    func updateRestaurantDraft(deviceId: String, onboardingId: String, items: [RestaurantMenuItem]) async throws {
        try await mutate(API.restaurantUpdateDraft, ["deviceId": deviceId, "onboardingId": onboardingId, "items": Self.menuItemsArgs(items)])
    }

    func publishRestaurant(deviceId: String, onboardingId: String, items: [RestaurantMenuItem]) async throws {
        let _: RestaurantPublishResult = try await act(API.restaurantPublish, ["deviceId": deviceId, "onboardingId": onboardingId, "items": Self.menuItemsArgs(items)])
    }

    func ingestMenu(restaurantId: String) async throws -> IngestResult {
        try await act(API.menuIngest, ["restaurantId": restaurantId])
    }

    func createParty(restaurantId: String, size: Int, hostDeviceId: String) async throws -> CreatedParty {
        try await mutate(API.partiesCreate, ["restaurantId": restaurantId, "size": Double(size), "hostDeviceId": hostDeviceId])
    }

    func startWithFewer(partyId: String, hostDeviceId: String) async throws {
        try await mutate(API.partiesStartWithFewer, ["partyId": partyId, "hostDeviceId": hostDeviceId])
    }

    func reset(partyId: String, hostDeviceId: String) async throws {
        try await mutate(API.partiesReset, ["partyId": partyId, "hostDeviceId": hostDeviceId])
    }
    func announceTap(partyId: String, userId: String, deviceId: String, attemptId: String, token: String) async throws {
        try await mutate(API.tapAnnounce, ["partyId": partyId, "userId": userId, "deviceId": deviceId,
                                          "attemptId": attemptId, "dinerToken": token])
    }
    func respondTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, token: String) async throws {
        try await mutate(API.tapRespond, ["partyId": partyId, "userId": userId, "hostDeviceId": hostDeviceId,
                                         "attemptId": attemptId, "hostToken": token])
    }
    func rejectTap(partyId: String, userId: String, hostDeviceId: String, attemptId: String, reason: String) async throws {
        try await mutate(API.tapReject, ["partyId": partyId, "userId": userId, "hostDeviceId": hostDeviceId,
                                        "attemptId": attemptId, "reason": reason])
    }

    func join(partyId: String?, joinCode: String?, userId: String, via: JoinVia,
              hostDeviceId: String?, deviceId: String?) async throws -> JoinResult {
        var args: [String: ConvexEncodable?] = ["userId": userId, "via": via.rawValue]
        if let partyId { args["partyId"] = partyId }
        if let joinCode { args["joinCode"] = joinCode }
        if let hostDeviceId { args["hostDeviceId"] = hostDeviceId }
        if let deviceId { args["deviceId"] = deviceId }
        return try await mutate(API.partiesJoin, args)
    }

    func leave(partyId: String, userId: String, deviceId: String) async throws {
        try await mutate(API.partiesLeave, ["partyId": partyId, "userId": userId, "deviceId": deviceId])
    }

    func setHunger(partyId: String, userId: String, deviceId: String, hunger: Hunger) async throws {
        try await mutate(API.partiesSetHunger, ["partyId": partyId, "userId": userId, "deviceId": deviceId, "hunger": hunger.rawValue])
    }

    func pick(partyId: String, userId: String, deviceId: String, itemId: String) async throws {
        try await mutate(API.ordersPick, ["partyId": partyId, "userId": userId, "deviceId": deviceId, "itemId": itemId])
    }

    func cacheDishImage(partyId: String, userId: String, deviceId: String, itemId: String, sourceImageUrl: String, pngData: Data) async throws {
        let uploadUrl: String? = try await mutate(API.ordersPrepareDishImageUpload, [
            "partyId": partyId, "userId": userId, "deviceId": deviceId, "itemId": itemId, "imageUrl": sourceImageUrl,
        ])
        guard let uploadUrl, let url = URL(string: uploadUrl) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("image/png", forHTTPHeaderField: "Content-Type")
        request.httpBody = pngData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw TTError.network("Dish image upload failed")
        }
        struct UploadResponse: Decodable { let storageId: String }
        let uploaded = try JSONDecoder().decode(UploadResponse.self, from: data)
        let _: Bool = try await mutate(API.ordersSaveDishImage, [
            "partyId": partyId, "userId": userId, "deviceId": deviceId, "itemId": itemId,
            "imageUrl": sourceImageUrl, "storageId": uploaded.storageId,
        ])
    }

    func add(partyId: String, userId: String, deviceId: String, itemId: String, shared: Bool) async throws {
        let _: String = try await mutate(API.ordersAdd, ["partyId": partyId, "userId": userId, "deviceId": deviceId, "itemId": itemId, "shared": shared])
    }

    func remove(partyId: String, userId: String, deviceId: String, lineId: String) async throws -> RemoveResult {
        try await mutate(API.ordersRemove, ["partyId": partyId, "userId": userId, "deviceId": deviceId, "lineId": lineId])
    }

    func confirm(partyId: String, userId: String, deviceId: String) async throws {
        try await mutate(API.ordersConfirm, ["partyId": partyId, "userId": userId, "deviceId": deviceId])
    }
}

extension TTError {
    /// Maps convex-swift errors. ConvexError(data:) carries our JSON {code, message, reasons}.
    static func from(_ error: Error) -> TTError {
        if let e = error as? TTError { return e }
        if let e = error as? ClientError {
            switch e {
            case .ConvexError(let data):
                struct Payload: Decodable { let code: Code; let message: String; let reasons: [String]? }
                if let p = try? JSONDecoder().decode(Payload.self, from: Data(data.utf8)) {
                    return TTError(code: p.code, message: p.message, reasons: p.reasons ?? [])
                }
                return TTError(code: .UNKNOWN, message: data)
            case .ServerError(let msg): return TTError(code: .UNKNOWN, message: msg)
            case .InternalError(let msg): return .network(msg)
            }
        }
        return TTError(code: .UNKNOWN, message: error.localizedDescription)
    }
}
