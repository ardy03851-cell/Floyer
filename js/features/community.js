import {
  auth, db, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, increment, setDoc, getDoc, getDocs,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "../core/firebase.js";

import {
  showToast as showToastBase,
  playShimmer,
  avatarHtml,
  timeAgo,
  escapeHtml,
  applyAccentColor
} from "../core/utils.js";

import {
  BADGE_BY_ID,
  MAX_EQUIPPED_BADGES,
  STREAK_WINDOW_DAYS,
  getEarnedBadges,
  badgeRowHtml
} from "../data/badges.js";

import { createAmbientController } from "./ambient.js";


export function startFoyerApp() {
  let currentUser = null;
  let currentSort = "new";
  let allPosts = [];
  let openComments = new Set();
  let myProfile = null;

  const userCache = new Map();

  const authArea = document.getElementById("authArea");
  const composerCard = document.getElementById("composerCard");
  const feed = document.getElementById("feed");
  const modalRoot = document.getElementById("modalRoot");
  const toastEl = document.getElementById("toast");
  const topbar = document.getElementById("topbar");

  const ambient = createAmbientController({
    container: document.getElementById("ambientScene3d"),
    showToast: message => showToastBase(toastEl, message)
  });

  const showToast = message => showToastBase(toastEl, message);

  const AMBIENT_3D_STORAGE_KEY = "foyer_ambient3d_enabled";

  function isAmbient3dEnabled() {
    return localStorage.getItem(AMBIENT_3D_STORAGE_KEY) === "1";
  }

  function setAmbient3dEnabled(enabled) {
    localStorage.setItem(
      AMBIENT_3D_STORAGE_KEY,
      enabled ? "1" : "0"
    );

    if (enabled) {
      ambient.start();
    } else {
      ambient.stop();
    }
  }

  function renderAuthArea() {
    if (currentUser) {
      const photoURL = myProfile?.photoURL;
      const name =
        myProfile?.displayName ||
        currentUser.displayName ||
        currentUser.email;

      const myEquipped = myProfile?.equippedBadges || [];

      if (myProfile?.accentColor) {
        applyAccentColor(myProfile.accentColor);
      }

      authArea.innerHTML = `
        <button class="settings-btn" id="settingsBtn" title="Settings">
          <svg width="17" height="17" viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round">

            <circle cx="12" cy="12" r="3"/>

            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 1-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3.09 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        <div class="avatar-pill" id="userPill" style="cursor:pointer;">
          ${avatarHtml(
            name,
            photoURL,
            26,
            myProfile?.avatarBorder
          )}

          <span>${escapeHtml(name.split("@")[0])}</span>

          ${badgeRowHtml(myEquipped, 14)}
        </div>

        <button class="btn btn-ghost btn-danger" id="signOutBtn">
          Sign out
        </button>
      `;

      document
        .getElementById("settingsBtn")
        ?.addEventListener("click", openSettingsModal);

      document
        .getElementById("userPill")
        ?.addEventListener("click", openProfileModal);

      document
        .getElementById("signOutBtn")
        ?.addEventListener("click", () => signOut(auth));

      composerCard.style.display = "block";

    } else {
      authArea.innerHTML = `
        <button class="btn btn-primary" id="openAuthBtn">
          Sign in
        </button>
      `;

      document
        .getElementById("openAuthBtn")
        ?.addEventListener("click", () => openAuthModal("signin"));

      composerCard.style.display = "none";
    }
  }


  function openAuthModal(mode) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modalBackdrop">
        <div class="modal shimmer-surface" id="authModal">

          <button class="modal-close" id="modalCloseBtn">
            &times;
          </button>

          <h2 class="display" id="modalTitle">
            ${mode === "signin" ? "Welcome back" : "Join the floor"}
          </h2>

          <p class="sub" id="modalSub">
            ${
              mode === "signin"
                ? "Sign in to post and join discussions."
                : "Create an account to start posting."
            }
          </p>

          <div
            id="nameField"
            style="display:${mode === "signup" ? "block" : "none"};"
          >
            <label for="authName">Display name</label>
            <input
              type="text"
              id="authName"
              placeholder="What should we call you?"
              maxlength="30"
            >
          </div>

          <label for="authEmail">Email</label>

          <input
            type="email"
            id="authEmail"
            placeholder="you@example.com"
            autocomplete="email"
          >

          <label for="authPassword">Password</label>

          <input
            type="password"
            id="authPassword"
            placeholder="At least 6 characters"
            autocomplete="${
              mode === "signin"
                ? "current-password"
                : "new-password"
            }"
          >

          <div class="auth-error" id="authErrorBox"></div>

          <button class="btn btn-primary" id="authSubmitBtn">
            ${mode === "signin" ? "Sign in" : "Create account"}
          </button>

          <div class="switch-mode">
            ${
              mode === "signin"
                ? `New here? <button id="switchModeBtn">Create an account</button>`
                : `Already have an account? <button id="switchModeBtn">Sign in</button>`
            }
          </div>

        </div>
      </div>
    `;

    const backdrop = document.getElementById("modalBackdrop");
    const closeBtn = document.getElementById("modalCloseBtn");
    const switchBtn = document.getElementById("switchModeBtn");
    const submitBtn = document.getElementById("authSubmitBtn");
    const errorBox = document.getElementById("authErrorBox");

    setTimeout(() => {
      playShimmer(document.getElementById("authModal"));
    }, 50);

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) {
        closeAuthModal();
      }
    });

    closeBtn.addEventListener("click", closeAuthModal);

    switchBtn.addEventListener("click", () => {
      openAuthModal(
        mode === "signin"
          ? "signup"
          : "signin"
      );
    });

    submitBtn.addEventListener("click", async () => {
      errorBox.classList.remove("show");

      const email =
        document.getElementById("authEmail").value.trim();

      const password =
        document.getElementById("authPassword").value;

      const name =
        mode === "signup"
          ? document.getElementById("authName").value.trim()
          : null;

      if (!email || !password) {
        errorBox.textContent =
          "Please fill in all fields.";

        errorBox.classList.add("show");
        return;
      }

      if (mode === "signup" && !name) {
        errorBox.textContent =
          "Please choose a display name.";

        errorBox.classList.add("show");
        return;
      }

      submitBtn.disabled = true;

      submitBtn.textContent =
        mode === "signin"
          ? "Signing in..."
          : "Creating account...";

      try {
        if (mode === "signin") {
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );

        } else {
          const cred =
            await createUserWithEmailAndPassword(
              auth,
              email,
              password
            );

          await updateProfile(cred.user, {
            displayName: name
          });

          await setDoc(
            doc(db, "users", cred.user.uid),
            {
              displayName: name,
              email,
              createdAt: serverTimestamp()
            }
          );
        }

        closeAuthModal();

        showToast(
          mode === "signin"
            ? "Welcome back!"
            : "Account created!"
        );

      } catch (err) {
        errorBox.textContent =
          friendlyAuthError(err);

        errorBox.classList.add("show");

        submitBtn.disabled = false;

        submitBtn.textContent =
          mode === "signin"
            ? "Sign in"
            : "Create account";
      }
    });
  }


  function friendlyAuthError(err) {
    const code = err?.code || "";

    if (code.includes("email-already-in-use")) {
      return "That email is already registered. Try signing in.";
    }

    if (code.includes("invalid-email")) {
      return "That email address doesn't look right.";
    }

    if (code.includes("weak-password")) {
      return "Password should be at least 6 characters.";
    }

    if (
      code.includes("user-not-found") ||
      code.includes("wrong-password") ||
      code.includes("invalid-credential")
    ) {
      return "Incorrect email or password.";
    }

    if (code.includes("too-many-requests")) {
      return "Too many attempts. Please wait a moment and try again.";
    }

    return "Something went wrong. Please try again.";
  }


  function closeAuthModal() {
    modalRoot.innerHTML = "";
  }


  /* ================ SETTINGS ================ */

  function openSettingsModal() {
    const enabled = isAmbient3dEnabled();

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modalBackdrop">

        <div class="modal shimmer-surface" id="settingsModal">

          <button class="modal-close" id="modalCloseBtn">
            &times;
          </button>

          <h2 class="display">Settings</h2>

          <p class="sub">
            Tune how Foyer looks and feels.
          </p>

          <div class="settings-section">

            <div class="settings-row">

              <div class="settings-row-text">

                <div class="settings-row-title">
                  Ambient 3D backdrop
                  <span class="settings-beta-pill">
                    Test feature
                  </span>
                </div>

                <div class="settings-row-desc">
                  Adds a soft, floating 3D scene behind the page.
                  Experimental — may affect performance on older devices.
                </div>

              </div>

              <button
                type="button"
                class="toggle-switch ${enabled ? "on" : ""}"
                id="ambient3dToggle"
                role="switch"
                aria-checked="${enabled}"
              >
                <span class="toggle-switch-knob"></span>
              </button>

            </div>

          </div>

        </div>
      </div>
    `;

    setTimeout(() => {
      playShimmer(
        document.getElementById("settingsModal")
      );
    }, 50);

    const backdrop =
      document.getElementById("modalBackdrop");

    const closeBtn =
      document.getElementById("modalCloseBtn");

    const toggle =
      document.getElementById("ambient3dToggle");

    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) {
        closeAuthModal();
      }
    });

    closeBtn.addEventListener(
      "click",
      closeAuthModal
    );

    toggle.addEventListener("click", () => {
      const nextState =
        !isAmbient3dEnabled();

      setAmbient3dEnabled(nextState);

      toggle.classList.toggle(
        "on",
        nextState
      );

      toggle.setAttribute(
        "aria-checked",
        String(nextState)
      );
    });
  }


  /* ---------------- USER PROFILE ---------------- */

  async function getUserProfile(uid, force = false) {
    if (!uid) return null;

    if (!force && userCache.has(uid)) {
      return userCache.get(uid);
    }

    try {
      const snap =
        await getDoc(doc(db, "users", uid));

      if (!snap.exists()) {
        return null;
      }

      const profile = {
        uid,
        ...snap.data()
      };

      userCache.set(uid, profile);

      return profile;

    } catch (error) {
      console.error(
        "Failed to load user profile:",
        error
      );

      return null;
    }
  }


  /* ---------------- LIVE DATA ---------------- */

  const commentUnsubs = {};
  const reactionUnsubs = {};
  const voteUnsubs = {};

  const REACTION_EMOJIS = [
    "🔥",
    "❤️",
    "😂",
    "😮",
    "👏"
  ];


  function cleanupPostListeners(
    postIdsToKeep = new Set()
  ) {
    for (const [
      postId,
      unsubscribe
    ] of Object.entries(commentUnsubs)) {

      if (!postIdsToKeep.has(postId)) {
        unsubscribe?.();
        delete commentUnsubs[postId];
      }
    }

    for (const [
      postId,
      unsubscribe
    ] of Object.entries(reactionUnsubs)) {

      if (!postIdsToKeep.has(postId)) {
        unsubscribe?.();
        delete reactionUnsubs[postId];
      }
    }

    for (const [
      postId,
      unsubscribe
    ] of Object.entries(voteUnsubs)) {

      if (!postIdsToKeep.has(postId)) {
        unsubscribe?.();
        delete voteUnsubs[postId];
      }
    }
  }


  function resetUserVoteListeners() {
    Object.values(voteUnsubs)
      .forEach(unsubscribe => {
        unsubscribe?.();
      });

    Object.keys(voteUnsubs)
      .forEach(postId => {
        delete voteUnsubs[postId];
      });

    allPosts.forEach(post => {
      post._myVote = 0;
    });
  }


  function listenToPosts() {
    const postsQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    onSnapshot(
      postsQuery,

      snap => {
        const posts = [];

        snap.forEach(documentSnapshot => {
          posts.push({
            id: documentSnapshot.id,
            ...documentSnapshot.data()
          });
        });

        const previousIds =
          allPosts
            .map(post => post.id)
            .join(",");

        const nextIds =
          posts
            .map(post => post.id)
            .join(",");

        const idsChanged =
          previousIds !== nextIds;

        posts.forEach(post => {
          const existing =
            allPosts.find(
              previous =>
                previous.id === post.id
            );

          if (!existing) return;

          post._comments =
            existing._comments;

          post._myVote =
            existing._myVote;

          post._reactions =
            existing._reactions;

          post._myReaction =
            existing._myReaction;
        });

        allPosts = posts;

        cleanupPostListeners(
          new Set(
            posts.map(post => post.id)
          )
        );

        if (idsChanged) {
          renderFeed();
        } else {
          posts.forEach(post => {
            const root =
              document.querySelector(
                `.post[data-id="${post.id}"]`
              );

            if (!root) return;

            const countEl =
              root.querySelector(".vote-count");

            if (countEl) {
              countEl.textContent =
                post.score || 0;
            }

            const commentToggle =
              root.querySelector(".comment-toggle");

            if (commentToggle) {
              commentToggle.innerHTML =
                `💬 ${post.commentCount || 0}`;
            }
          });
        }

        posts.forEach(post => {
          listenToComments(post.id);
          listenToReactions(post.id);

          if (currentUser) {
            listenToMyVote(post.id);
          }

          if (!userCache.has(post.authorId)) {
            getUserProfile(post.authorId)
              .then(() => {

                const root =
                  document.querySelector(
                    `.post[data-id="${post.id}"]`
                  );

                if (!root) return;

                const liveAuthor =
                  userCache.get(post.authorId);

                if (!liveAuthor) return;

                const nameEl =
                  root.querySelector(
                    ".post-meta span"
                  );

                if (
                  nameEl &&
                  liveAuthor.displayName
                ) {
                  nameEl.textContent =
                    liveAuthor.displayName;
                }
              });
          }
        });
      },

      error => {
        console.error(
          "Post listener failed:",
          error
        );

        showToast(
          "Couldn't load the floor right now"
        );
      }
    );
  }


  function renderCommentsListHtml(
    postId,
    comments
  ) {
    return comments
      .map(comment => {
        const liveCommenter =
          userCache.get(comment.authorId);

        const commentName =
          liveCommenter?.displayName ||
          comment.authorName;

        const commentPhoto =
          liveCommenter?.photoURL;

        const commentIsDeveloper =
          liveCommenter
            ? liveCommenter.isDeveloper
            : comment.authorIsDeveloper;

        const equippedBadges =
          liveCommenter
            ? liveCommenter.equippedBadges
            : comment.authorEquippedBadges;

        return `
          <div class="comment">

            ${avatarHtml(
              commentName,
              commentPhoto,
              22,
              liveCommenter?.avatarBorder
            )}

            <div class="comment-body">

              <div class="comment-meta">

                ${escapeHtml(
                  commentName || "Someone"
                )}

                ${
                  commentIsDeveloper
                    ? `
                      <img
                        src="assets/icons/devicon.png"
                        alt="Developer"
                        title="Developer"
                        style="
                          width:12px;
                          height:12px;
                          border-radius:3px;
                          vertical-align:middle;
                        "
                      >
                    `
                    : ""
                }

                ${badgeRowHtml(
                  equippedBadges,
                  12
                )}

                &middot;

                ${timeAgo(
                  comment.createdAt
                )}

              </div>

              <div class="comment-text">
                ${escapeHtml(comment.text)}
              </div>

            </div>

          </div>
        `;
      })
      .join("");
  }


  function listenToComments(postId) {
    if (commentUnsubs[postId]) return;

    const commentsQuery = query(
      collection(
        db,
        "posts",
        postId,
        "comments"
      ),
      orderBy("createdAt", "asc")
    );

    commentUnsubs[postId] =
      onSnapshot(
        commentsQuery,

        snap => {
          const comments = [];

          snap.forEach(documentSnapshot => {
            comments.push(
              documentSnapshot.data()
            );
          });

          const post =
            allPosts.find(
              currentPost =>
                currentPost.id === postId
            );

          if (post) {
            post._comments = comments;
          }

          const refreshCommentsList = () => {
            const panel =
              document.getElementById(
                `comments-${postId}`
              );

            if (!panel) return;

            const list =
              panel.querySelector(
                ".comments-list"
              );

            if (list) {
              list.innerHTML =
                renderCommentsListHtml(
                  postId,
                  comments
                );
            }
          };

          const missingAuthors =
            comments.filter(
              comment =>
                comment.authorId &&
                !userCache.has(
                  comment.authorId
                )
            );

          if (missingAuthors.length > 0) {
            Promise.all(
              missingAuthors.map(
                comment =>
                  getUserProfile(
                    comment.authorId
                  )
              )
            ).then(refreshCommentsList);
          } else {
            refreshCommentsList();
          }

          const toggle =
            document.querySelector(
              `.post[data-id="${postId}"] .comment-toggle`
            );

          if (toggle) {
            toggle.innerHTML =
              `💬 ${comments.length}`;
          }
        }
      );
  }


  function listenToReactions(postId) {
    if (reactionUnsubs[postId]) return;

    reactionUnsubs[postId] =
      onSnapshot(
        collection(
          db,
          "posts",
          postId,
          "reactions"
        ),

        snap => {
          const post =
            allPosts.find(
              currentPost =>
                currentPost.id === postId
            );

          if (!post) return;

          const counts = {};

          snap.forEach(documentSnapshot => {
            const emoji =
              documentSnapshot.data().emoji;

            if (emoji) {
              counts[emoji] =
                (counts[emoji] || 0) + 1;
            }
          });

          post._reactions = counts;

          post._myReaction =
            currentUser
              ? (
                  snap.docs.find(
                    documentSnapshot =>
                      documentSnapshot.id ===
                      currentUser.uid
                  )?.data().emoji || null
                )
              : null;

          const bar =
            document.getElementById(
              `reactions-${postId}`
            );

          if (!bar) return;

          bar.innerHTML =
            REACTION_EMOJIS
              .map(emoji => {
                const count =
                  counts[emoji] || 0;

                const reacted =
                  post._myReaction === emoji;

                return `
                  <button
                    class="reaction-btn${
                      reacted
                        ? " reacted"
                        : ""
                    }"
                    data-emoji="${emoji}"
                    data-id="${postId}"
                  >
                    ${emoji}${
                      count > 0
                        ? ` <span>${count}</span>`
                        : ""
                    }
                  </button>
                `;
              })
              .join("");

          bar
            .querySelectorAll(
              ".reaction-btn"
            )
            .forEach(button => {
              button.addEventListener(
                "click",
                () =>
                  handleReaction(
                    postId,
                    button.dataset.emoji,
                    button
                  )
              );
            });
        }
      );
  }


  async function handleReaction(
    postId,
    emoji,
    button
  ) {
    if (!currentUser) {
      return openAuthModal("signin");
    }

    button.classList.remove("pop");

    void button.offsetWidth;

    button.classList.add("pop");

    const post =
      allPosts.find(
        currentPost =>
          currentPost.id === postId
      );

    const reactionRef =
      doc(
        db,
        "posts",
        postId,
        "reactions",
        currentUser.uid
      );

    const isSame =
      post &&
      post._myReaction === emoji;

    try {
      if (isSame) {
        await deleteDoc(
          reactionRef
        );
      } else {
        await setDoc(
          reactionRef,
          {
            emoji,
            uid: currentUser.uid
          }
        );
      }
    } catch (error) {
      showToast(
        "Couldn't save reaction"
      );
    }
  }


  function listenToMyVote(postId) {
    if (
      !currentUser ||
      voteUnsubs[postId]
    ) {
      return;
    }

    const voteRef =
      doc(
        db,
        "posts",
        postId,
        "votes",
        currentUser.uid
      );

    voteUnsubs[postId] =
      onSnapshot(
        voteRef,

        snap => {
          const post =
            allPosts.find(
              currentPost =>
                currentPost.id === postId
            );

          if (!post) return;

          post._myVote =
            snap.exists()
              ? snap.data().value
              : 0;

          const root =
            document.querySelector(
              `.post[data-id="${postId}"]`
            );

          if (!root) return;

          const upButton =
            root.querySelector(
              ".upvote"
            );

          const downButton =
            root.querySelector(
              ".downvote"
            );

          const countElement =
            root.querySelector(
              ".vote-count"
            );

          if (upButton) {
            upButton.classList.toggle(
              "voted",
              post._myVote === 1
            );
          }

          if (downButton) {
            downButton.classList.toggle(
              "voted",
              post._myVote === -1
            );
          }

          if (countElement) {
            countElement.textContent =
              post.score || 0;
          }
        }
      );
  }


  /* ---------------- AUTH STATE ---------------- */

  onAuthStateChanged(
    auth,
    async user => {
      resetUserVoteListeners();

      currentUser = user;
      myProfile = null;

      if (user) {
        myProfile =
          await getUserProfile(
            user.uid,
            true
          );

        if (myProfile) {
          userCache.set(
            user.uid,
            myProfile
          );
        }
      }

      renderAuthArea();

      if (user) {
        allPosts.forEach(post => {
          listenToMyVote(post.id);
        });
      }
    }
  );


  /* ---------------- INIT ---------------- */

  listenToPosts();

  setTimeout(() => {
    playShimmer(topbar);
  }, 300);

  if (isAmbient3dEnabled()) {
    ambient.start();
  }
}
