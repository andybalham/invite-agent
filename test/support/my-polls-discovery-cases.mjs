// T-119: explicit acceptance answers shared by pure-rule, HTTP and live browser tests.
// No production matcher/normalizer supplies these expectations.
export const discoveryTitle = "Café Autumn get-together";
export const discoveryFilters = {
  active: ["draft", "open"], draft: ["draft"], open: ["open"], closed: ["closed"]
};

export function discoveryCases(foreignTitle) {
  return [
    { name: "blank", search: "", matches: "all" },
    { name: "exact", search: discoveryTitle, matches: "title" },
    { name: "case", search: "CAFÉ AUTUMN GET-TOGETHER", matches: "title" },
    { name: "NFC and Unicode whitespace", search: "  CAFE\u0301\u0085\u2003 AUTUMN  ", matches: "title" },
    { name: "substring", search: "Autumn", matches: "title" },
    { name: "punctuation", search: "get-together", matches: "title" },
    { name: "significant accent", search: "cafe", matches: "none" },
    { name: "significant punctuation", search: "get together", matches: "none" },
    { name: "literal, not regex", search: "caf.*", matches: "none" },
    { name: "title only: description", search: "description-only-needle", matches: "none" },
    { name: "title only: location", search: "location-only-needle", matches: "none" },
    { name: "title only: date", search: "2026-10-10", matches: "none" },
    { name: "foreign title", search: foreignTitle, matches: "none" },
    { name: "no match", search: "missing title", matches: "none" },
    { name: "Unicode blank", search: "\u0085\u2003", matches: "all" }
  ];
}

export function expectedDiscovery(polls, owner, filter, matches) {
  return polls.filter((poll) => poll.organiserId === owner && discoveryFilters[filter].includes(poll.status) &&
    (matches === "all" || (matches === "title" && poll.title === discoveryTitle)))
    .sort((a, b) => a.createdAt === b.createdAt
      ? (a.id === b.id ? 0 : a.id > b.id ? -1 : 1)
      : a.createdAt > b.createdAt ? -1 : 1);
}
