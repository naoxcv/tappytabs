// Owner: Role 1. One constant per backend function (Shared contract §3). Never type a function name inline.
enum API {
    // users
    static let usersUpsert = "users:upsert"
    static let usersMe = "users:me"
    static let usersFollowups = "users:followups"
    static let usersSummarize = "users:summarize"
    // menu
    static let menuRestaurants = "menu:restaurants"
    static let menuStatus = "menu:status"
    static let menuIngest = "menu:ingest"
    // parties
    static let partiesCreate = "parties:create"
    static let partiesJoin = "parties:join"
    static let partiesLeave = "parties:leave"
    static let partiesCurrent = "parties:current"
    static let partiesHosted = "parties:hosted"
    static let partiesForUser = "parties:forUser"
    static let partiesSetHunger = "parties:setHunger"
    static let partiesStartWithFewer = "parties:startWithFewer"
    static let partiesReset = "parties:reset"
    // Nearby Interaction token exchange
    static let tapAnnounce = "tap:announce"
    static let tapPending = "tap:pending"
    static let tapRespond = "tap:respond"
    static let tapSession = "tap:session"
    static let tapReject = "tap:reject"
    // messages
    static let messagesList = "messages:list"
    // orders
    static let ordersCandidates = "orders:candidates"
    static let ordersPick = "orders:pick"
    static let ordersLines = "orders:lines"
    static let ordersAddable = "orders:addable"
    static let ordersAdd = "orders:add"
    static let ordersRemove = "orders:remove"
    static let ordersConfirm = "orders:confirm"
}
