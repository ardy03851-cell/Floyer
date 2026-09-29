# Foyer — rebuilt structure

This version keeps the existing Firebase-backed community features, but reorganises the project so the important pieces have clear homes.

## Folder structure

```text
Foyer/
├── index.html                 # Page shell only
├── README.md
├── assets/
│   ├── badges/                # Badge artwork
│   └── icons/                 # App + developer icons
├── css/
│   └── app.css                # Shared visual system + responsive styles
└── js/
    ├── app.js                 # Tiny application entry point
    ├── core/
    │   ├── firebase.js        # Firebase setup + exported SDK functions
    │   └── utils.js           # Shared UI helpers
    ├── data/
    │   └── badges.js          # Badge registry + unlock rules
    └── features/
        ├── ambient.js         # Optional Three.js backdrop
        └── community.js       # Auth, profile, posting, feed and reactions
```

## Adding a badge

You should normally only need to edit `js/data/badges.js`.

Add an object to `BADGES`:

```js
{
  id: "mybadge",
  label: "My Badge",
  icon: "assets/badges/mybadge.png",
  rule: ({ profile, accountCreatedAt }) => {
    return (profile?.postCount || 0) >= 100;
  }
}
```

Then place `mybadge.png` in `assets/badges/`.

The registry automatically feeds:

- badge unlock checks
- the profile badge picker
- equipped badge rendering
- post author badges
- comment author badges

There is no separate `BADGE_INFO` object and no second list of badge names to keep in sync.

## Badge rule context

Every badge rule receives:

- `profile` — the user's Firestore profile data
- `authUser` — the Firebase Auth user
- `accountCreatedAt` — a `Date`, when available

The helper `hasPostingStreak()` is also available in the same badge module for streak-style badges.

## UI changes

The supplied Uiverse button, loader and selectable-value styles were adapted instead of pasted in unchanged. They now use Foyer's existing accent variables, focus states, reduced-motion handling, mobile sizing and softer shadows.

The rebuilt interaction system also fixes a few rough edges from the original implementation, including stale post listeners after deletion/sign-out and oversized video payloads being pushed toward Firestore.

## Running

Serve the folder from a local HTTP server rather than opening `index.html` directly. Firebase's browser modules and authentication work much more reliably from `http://localhost` / `https://` than from `file://`.

For example, with VS Code Live Server, open `index.html` through Live Server.
