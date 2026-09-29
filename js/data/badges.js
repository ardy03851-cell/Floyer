/**
 * Foyer badge registry.
 *
 * To add a badge, add ONE object to BADGES. The rest of the app discovers it
 * automatically: profile picker, badge rows, and unlock checks all use this registry.
 */
export const BADGES = [
  {
    id: "verified",
    label: "Verified",
    icon: "assets/badges/verified.png",
    rule: ({ profile, accountCreatedAt }) =>
      profile?.isVerifiedOverride === true || daysSince(accountCreatedAt) >= 7
  },
  {
    id: "popular",
    label: "Popular",
    icon: "assets/badges/popular.png",
    rule: ({ profile }) => (profile?.totalUpvotes || 0) >= 100
  },
  {
    id: "super",
    label: "Super Poster",
    icon: "assets/badges/super.png",
    rule: ({ profile }) => (profile?.postCount || 0) >= 50
  },
  {
    id: "chatter",
    label: "Chatterbox",
    icon: "assets/badges/chatter.png",
    rule: ({ profile }) => (profile?.commentsMade || 0) >= 25
  },
  {
    id: "earlybird",
    label: "Early Bird",
    icon: "assets/badges/earlybird.png",
    rule: ({ accountCreatedAt }) =>
      Boolean(accountCreatedAt && accountCreatedAt.getTime() <= EARLY_BIRD_CUTOFF.getTime())
  },
  {
    id: "streak",
    label: "On a Roll",
    icon: "assets/badges/streak.png",
    rule: ({ profile }) => hasPostingStreak(profile?.recentPostDates)
  }
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map(badge => [badge.id, badge]));
export const MAX_EQUIPPED_BADGES = 2;
export const EARLY_BIRD_CUTOFF = new Date("2026-09-01T00:00:00Z");
export const STREAK_DAYS_REQUIRED = 5;
export const STREAK_WINDOW_DAYS = 7;

function daysSince(date) {
  if (!date) return 0;
  return (Date.now() - date.getTime()) / 86400000;
}

export function hasPostingStreak(recentPostDates = []) {
  const now = Date.now();
  const windowMs = STREAK_WINDOW_DAYS * 86400000;
  const uniqueDays = new Set(
    recentPostDates
      .filter(timestamp => Number.isFinite(timestamp) && now - timestamp <= windowMs)
      .map(timestamp => new Date(timestamp).toDateString())
  );
  return uniqueDays.size >= STREAK_DAYS_REQUIRED;
}

export function getEarnedBadges(profile, authUser) {
  const accountCreatedAt = authUser?.metadata?.creationTime
    ? new Date(authUser.metadata.creationTime)
    : null;

  const context = { profile, authUser, accountCreatedAt };
  return BADGES.filter(badge => badge.rule(context)).map(badge => badge.id);
}

export function badgeRowHtml(equippedBadges = [], sizePx = 14) {
  return equippedBadges
    .filter(id => BADGE_BY_ID[id])
    .map(id => {
      const badge = BADGE_BY_ID[id];
      return `<img class="badge-icon" src="${badge.icon}" alt="${badge.label}" title="${badge.label}" style="width:${sizePx}px;height:${sizePx}px;">`;
    })
    .join("");
}
