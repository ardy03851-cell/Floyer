import {
  auth, db, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, increment, setDoc, getDoc, getDocs,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "./core/firebase.js";
import {
  showToast as showToastBase, playShimmer, avatarHtml, timeAgo, escapeHtml, applyAccentColor
} from "./core/utils.js";
import {
  BADGE_BY_ID, MAX_EQUIPPED_BADGES, STREAK_WINDOW_DAYS, getEarnedBadges, badgeRowHtml
} from "./data/badges.js";
import { createAmbientController } from "./features/ambient.js";


export function startFoyerApp() {
let currentUser = null;
let currentSort = "new";
let allPosts = [];
let openComments = new Set();
let myProfile = null; // { displayName, photoURL, isDeveloper }
const userCache = new Map(); // uid -> { displayName, photoURL, isDeveloper }

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

function isAmbient3dEnabled() { return ambient.isEnabled(); }
function setAmbient3dEnabled(enabled) { ambient.setEnabled(enabled); }

function renderAuthArea() {
  if (currentUser) {
    const photoURL = myProfile && myProfile.photoURL;
    const name = (myProfile && myProfile.displayName) || currentUser.displayName || currentUser.email;
    const myEquipped = (myProfile && myProfile.equippedBadges) || [];
    if (myProfile && myProfile.accentColor) applyAccentColor(myProfile.accentColor);
    authArea.innerHTML = `
      <button class="settings-btn" id="settingsBtn" title="Settings">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <div class="avatar-pill" id="userPill" style="cursor:pointer;">
        ${avatarHtml(name, photoURL, 26, myProfile && myProfile.avatarBorder)}
        <span>${escapeHtml(name.split("@")[0])}</span>
        ${badgeRowHtml(myEquipped, 14)}
      </div>
      <button class="btn btn-ghost btn-danger" id="signOutBtn">Sign out</button>
    `;
    document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
    document.getElementById("userPill").addEventListener("click", openProfileModal);
    document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));
    composerCard.style.display = "block";
  } else {
    authArea.innerHTML = `<button class="btn btn-primary" id="openAuthBtn">Sign in</button>`;
    document.getElementById("openAuthBtn").addEventListener("click", () => openAuthModal("signin"));
    composerCard.style.display = "none";
  }
}

function openAuthModal(mode) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal shimmer-surface" id="authModal">
        <button class="modal-close" id="modalCloseBtn">&times;</button>
        <h2 class="display" id="modalTitle">${mode === "signin" ? "Welcome back" : "Join the floor"}</h2>
        <p class="sub" id="modalSub">${mode === "signin" ? "Sign in to post and join discussions." : "Create an account to start posting."}</p>

        <div id="nameField" style="display:${mode === "signup" ? "block" : "none"};">
          <label for="authName">Display name</label>
          <input type="text" id="authName" placeholder="What should we call you?" maxlength="30">
        </div>

        <label for="authEmail">Email</label>
        <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">

        <label for="authPassword">Password</label>
        <input type="password" id="authPassword" placeholder="At least 6 characters" autocomplete="${mode === "signin" ? "current-password" : "new-password"}">

        <div class="auth-error" id="authErrorBox"></div>

        <button class="btn btn-primary" id="authSubmitBtn">${mode === "signin" ? "Sign in" : "Create account"}</button>

        <div class="switch-mode">
          ${mode === "signin"
            ? `New here? <button id="switchModeBtn">Create an account</button>`
            : `Already have an account? <button id="switchModeBtn">Sign in</button>`}
        </div>
      </div>
    </div>
  `;

  const backdrop = document.getElementById("modalBackdrop");
  const closeBtn = document.getElementById("modalCloseBtn");
  const switchBtn = document.getElementById("switchModeBtn");
  const submitBtn = document.getElementById("authSubmitBtn");
  const errorBox = document.getElementById("authErrorBox");

  setTimeout(() => playShimmer(document.getElementById("authModal")), 50);

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeAuthModal(); });
  closeBtn.addEventListener("click", closeAuthModal);
  switchBtn.addEventListener("click", () => openAuthModal(mode === "signin" ? "signup" : "signin"));

  submitBtn.addEventListener("click", async () => {
    errorBox.classList.remove("show");
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const name = mode === "signup" ? document.getElementById("authName").value.trim() : null;

    if (!email || !password) {
      errorBox.textContent = "Please fill in all fields.";
      errorBox.classList.add("show");
      return;
    }
    if (mode === "signup" && !name) {
      errorBox.textContent = "Please choose a display name.";
      errorBox.classList.add("show");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signin" ? "Signing in..." : "Creating account...";

    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, "users", cred.user.uid), {
          displayName: name,
          email: email,
          createdAt: serverTimestamp()
        });
      }
      closeAuthModal();
      showToast(mode === "signin" ? "Welcome back!" : "Account created!");
    } catch (err) {
      errorBox.textContent = friendlyAuthError(err);
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signin" ? "Sign in" : "Create account";
    }
  });
}

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("email-already-in-use")) return "That email is already registered. Try signing in.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong. Please try again.";
}

function closeAuthModal() {
  modalRoot.innerHTML = "";
}

/* ================ SETTINGS ================ */

const AMBIENT_3D_STORAGE_KEY = "foyer_ambient3d_enabled";

function isAmbient3dEnabled() {
  return localStorage.getItem(AMBIENT_3D_STORAGE_KEY) === "1";
}

function setAmbient3dEnabled(on) {
  localStorage.setItem(AMBIENT_3D_STORAGE_KEY, on ? "1" : "0");
  if (on) ambient.start(); else ambient.stop();
}

function openSettingsModal() {
  const on = isAmbient3dEnabled();
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal shimmer-surface" id="settingsModal">
        <button class="modal-close" id="modalCloseBtn">&times;</button>
        <h2 class="display">Settings</h2>
        <p class="sub">Tune how Foyer looks and feels.</p>

        <div class="settings-section">
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Ambient 3D backdrop <span class="settings-beta-pill">Test feature</span></div>
              <div class="settings-row-desc">Adds a soft, floating 3D scene behind the page. Experimental — may affect performance on older devices.</div>
            </div>
            <button type="button" class="toggle-switch ${on ? "on" : ""}" id="ambient3dToggle" role="switch" aria-checked="${on}">
              <span class="toggle-switch-knob"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => playShimmer(document.getElementById("settingsModal")), 50);

  const backdrop = document.getElementById("modalBackdrop");
  const closeBtn = document.getElementById("modalCloseBtn");
  const toggle = document.getElementById("ambient3dToggle");

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeAuthModal(); });
  closeBtn.addEventListener("click", closeAuthModal);

  toggle.addEventListener("click", () => {
    const nowOn = !toggle.classList.contains("on");
    toggle.classList.toggle("on", nowOn);
    toggle.setAttribute("aria-checked", String(nowOn));
    setAmbient3dEnabled(nowOn);
  });
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB raw file cap, before compression
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AVATAR_MAX_DIMENSION = 300; // px, longest side after resize
const FIRESTORE_FIELD_SAFE_BYTES = 700 * 1024; // stay safely under Firestore's 1MB field cap

function compressImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > height && width > AVATAR_MAX_DIMENSION) {
        height = Math.round(height * (AVATAR_MAX_DIMENSION / width));
        width = AVATAR_MAX_DIMENSION;
      } else if (height > AVATAR_MAX_DIMENSION) {
        width = Math.round(width * (AVATAR_MAX_DIMENSION / height));
        height = AVATAR_MAX_DIMENSION;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.85;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);

      while (dataUrl.length > FIRESTORE_FIELD_SAFE_BYTES && quality > 0.3) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }

      if (dataUrl.length > FIRESTORE_FIELD_SAFE_BYTES) {
        reject(new Error("Image is too detailed to compress small enough. Try a simpler image."));
        return;
      }

      resolve(dataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read that image file."));
    };

    img.src = objectUrl;
  });
}

const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_POST_VIDEO_BYTES = 8 * 1024 * 1024;
const POST_IMAGE_MAX_DIM = 1200;
const POST_IMAGE_QUALITY = 0.82;
const POST_FIRESTORE_SAFE = 900 * 1024;

function compressPostImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > POST_IMAGE_MAX_DIM || height > POST_IMAGE_MAX_DIM) {
        if (width > height) { height = Math.round(height * POST_IMAGE_MAX_DIM / width); width = POST_IMAGE_MAX_DIM; }
        else { width = Math.round(width * POST_IMAGE_MAX_DIM / height); height = POST_IMAGE_MAX_DIM; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      let q = POST_IMAGE_QUALITY;
      let dataUrl = canvas.toDataURL("image/jpeg", q);
      while (dataUrl.length > POST_FIRESTORE_SAFE && q > 0.3) { q -= 0.08; dataUrl = canvas.toDataURL("image/jpeg", q); }
      if (dataUrl.length > POST_FIRESTORE_SAFE) { reject(new Error("Image too large to attach even after compression. Try a smaller image.")); return; }
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read image.")); };
    img.src = url;
  });
}

function encodeVideoToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (result.length > POST_FIRESTORE_SAFE) {
        reject(new Error("That video is too large for this post system. Try a shorter or smaller video."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Couldn't read video."));
    reader.readAsDataURL(file);
  });
}

function openProfileModal() {
  if (!currentUser) return;
  const name = (myProfile && myProfile.displayName) || currentUser.displayName || "";
  const photoURL = myProfile && myProfile.photoURL;

  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal shimmer-surface" id="profileModal">
        <button class="modal-close" id="modalCloseBtn">&times;</button>
        <h2 class="display">Your profile</h2>
        <p class="sub">Update your photo or display name.</p>

        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:6px;">
          <div id="avatarPreviewWrap">${avatarHtml(name, photoURL, 88)}</div>
          <input type="file" id="avatarFileInput" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none;">
          <button class="btn btn-ghost" id="choosePhotoBtn" type="button">Change photo</button>
          <span style="font-size:0.78rem;color:var(--ink-soft);">JPG, PNG, WEBP or GIF. Max 5MB, auto-resized.</span>
        </div>

        <label for="profileNameInput">Display name</label>
        <input type="text" id="profileNameInput" maxlength="30" value="${escapeHtml(name)}">

        <div style="display:flex;gap:10px;">
          <div style="flex:1;">
            <label for="profilePronounsInput">Pronouns <span style="font-weight:400;opacity:0.6;">(optional)</span></label>
            <input type="text" id="profilePronounsInput" maxlength="20" placeholder="e.g. she/her" value="${escapeHtml((myProfile && myProfile.pronouns) || "")}">
          </div>
          <div style="flex:2;">
            <label for="profileStatusInput">Status <span style="font-weight:400;opacity:0.6;">(40 chars)</span></label>
            <input type="text" id="profileStatusInput" maxlength="40" placeholder="What's your vibe today?" value="${escapeHtml((myProfile && myProfile.statusLine) || "")}">
          </div>
        </div>

        <label for="profileBioInput">Bio <span style="font-weight:400;opacity:0.6;">(120 chars)</span></label>
        <input type="text" id="profileBioInput" maxlength="120" placeholder="Say something about yourself&hellip;" value="${escapeHtml((myProfile && myProfile.bio) || "")}">

        <label>Accent colour</label>
        <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;" id="accentPicker">
          ${[
            { key:"slate", hex:"#8E97A8", label:"Slate" },
            { key:"rose",  hex:"#B07080", label:"Rose"  },
            { key:"sage",  hex:"#7A9E87", label:"Sage"  },
            { key:"amber", hex:"#A8946A", label:"Amber" },
            { key:"plum",  hex:"#9B7FAE", label:"Plum"  },
            { key:"ink",   hex:"#6B6862", label:"Ink"   }
          ].map(c => {
            const active = (myProfile && myProfile.accentColor) === c.key || (!myProfile?.accentColor && c.key === "slate");
            return `<button type="button" data-accent="${c.key}" title="${c.label}" style="width:28px;height:28px;border-radius:50%;background:${c.hex};border:${active ? "3px solid var(--ink)" : "2px solid transparent"};outline:${active ? "2px solid "+c.hex : "none"};outline-offset:2px;transition:transform 0.12s;"></button>`;
          }).join("")}
        </div>

        <label>Avatar border</label>
        <div style="display:flex;gap:8px;margin-top:6px;" id="borderPicker">
          ${["none","ring","double"].map(style => {
            const active = (myProfile && myProfile.avatarBorder || "none") === style;
            const labels = { none:"None", ring:"Ring", double:"Double" };
            return `<button type="button" data-border="${style}" style="padding:6px 14px;border-radius:999px;border:1px solid ${active ? "var(--vein)" : "var(--seam)"};background:${active ? "rgba(142,151,168,0.12)" : "var(--floor)"};font-size:0.8rem;font-weight:600;color:var(--ink-soft);transition:all 0.12s;">${labels[style]}</button>`;
          }).join("")}
        </div>

        <label>Badges (equip up to 2)</label>
        <div id="badgeGrid" style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;"></div>

        <div class="auth-error" id="profileErrorBox"></div>

        <button class="btn btn-primary" id="saveProfileBtn">Save changes</button>
      </div>
    </div>
  `;

  const earnedBadgeKeys = getEarnedBadges(myProfile, currentUser);
  let equippedSet = new Set((myProfile && myProfile.equippedBadges) || []);
  const badgeGrid = document.getElementById("badgeGrid");

  function renderBadgeGrid() {
    if (earnedBadgeKeys.length === 0) {
      badgeGrid.innerHTML = `<span style="font-size:0.82rem;color:var(--ink-soft);">No badges earned yet. Keep posting and engaging to unlock some.</span>`;
      return;
    }
    badgeGrid.innerHTML = earnedBadgeKeys.map(key => {
      const info = BADGE_BY_ID[key];
      const isEquipped = equippedSet.has(key);
      return `
        <button type="button" class="badge-toggle" data-key="${key}" style="
          display:flex;flex-direction:column;align-items:center;gap:4px;
          border:1px solid ${isEquipped ? "var(--vein)" : "var(--seam)"};
          background:${isEquipped ? "rgba(142,151,168,0.12)" : "var(--floor)"};
          border-radius:12px;padding:8px 12px;min-width:72px;">
          <img src="${info.icon}" alt="${info.label}" style="width:32px;height:32px;">
          <span style="font-size:0.72rem;font-weight:600;color:var(--ink-soft);">${info.label}</span>
        </button>
      `;
    }).join("");

    badgeGrid.querySelectorAll(".badge-toggle").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        if (equippedSet.has(key)) {
          equippedSet.delete(key);
        } else {
          if (equippedSet.size >= MAX_EQUIPPED_BADGES) {
            showToast("You can only equip 2 badges at once");
            return;
          }
          equippedSet.add(key);
        }
        renderBadgeGrid();
      });
    });
  }

  renderBadgeGrid();

  const backdrop = document.getElementById("modalBackdrop");
  const closeBtn = document.getElementById("modalCloseBtn");
  const fileInput = document.getElementById("avatarFileInput");
  const chooseBtn = document.getElementById("choosePhotoBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const errorBox = document.getElementById("profileErrorBox");
  const previewWrap = document.getElementById("avatarPreviewWrap");

  setTimeout(() => playShimmer(document.getElementById("profileModal")), 50);

  let selectedAccent = (myProfile && myProfile.accentColor) || "slate";
  let selectedBorder = (myProfile && myProfile.avatarBorder) || "none";

  document.getElementById("accentPicker").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-accent]");
    if (!btn) return;
    selectedAccent = btn.dataset.accent;
    document.querySelectorAll("#accentPicker [data-accent]").forEach(b => {
      const isNow = b.dataset.accent === selectedAccent;
      b.style.border = isNow ? "3px solid var(--ink)" : "2px solid transparent";
      b.style.outline = isNow ? `2px solid ${b.style.background}` : "none";
      b.style.transform = isNow ? "scale(1.15)" : "scale(1)";
    });
    applyAccentColor(selectedAccent);
  });

  document.getElementById("borderPicker").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-border]");
    if (!btn) return;
    selectedBorder = btn.dataset.border;
    document.querySelectorAll("#borderPicker [data-border]").forEach(b => {
      const isNow = b.dataset.border === selectedBorder;
      b.style.border = `1px solid ${isNow ? "var(--vein)" : "var(--seam)"}`;
      b.style.background = isNow ? "rgba(142,151,168,0.12)" : "var(--floor)";
    });
  });

  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeAuthModal(); });
  closeBtn.addEventListener("click", closeAuthModal);
  chooseBtn.addEventListener("click", () => fileInput.click());

  let pendingDataUrl = null;

  fileInput.addEventListener("change", async () => {
    errorBox.classList.remove("show");
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      errorBox.textContent = "Please choose a JPG, PNG, WEBP, or GIF image.";
      errorBox.classList.add("show");
      fileInput.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      errorBox.textContent = "That image is too large. Max size is 5MB.";
      errorBox.classList.add("show");
      fileInput.value = "";
      return;
    }

    chooseBtn.disabled = true;
    chooseBtn.textContent = "Processing...";

    try {
      const dataUrl = await compressImageToBase64(file);
      pendingDataUrl = dataUrl;
      previewWrap.innerHTML = `<span class="avatar-circle" style="width:88px;height:88px;padding:0;overflow:hidden;"><img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
    } catch (err) {
      errorBox.textContent = err.message || "Couldn't process that image.";
      errorBox.classList.add("show");
      fileInput.value = "";
    } finally {
      chooseBtn.disabled = false;
      chooseBtn.textContent = "Change photo";
    }
  });

  saveBtn.addEventListener("click", async () => {
    errorBox.classList.remove("show");
    const newName = document.getElementById("profileNameInput").value.trim();
    if (!newName) {
      errorBox.textContent = "Please choose a display name.";
      errorBox.classList.add("show");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const newPhotoURL = pendingDataUrl || (myProfile && myProfile.photoURL) || null;

      const finalEquipped = Array.from(equippedSet).slice(0, 2);
      const newBio = document.getElementById("profileBioInput").value.trim().slice(0, 120);
      const newPronouns = document.getElementById("profilePronounsInput").value.trim().slice(0, 20);
      const newStatusLine = document.getElementById("profileStatusInput").value.trim().slice(0, 40);

      await updateProfile(currentUser, { displayName: newName });
      await setDoc(doc(db, "users", currentUser.uid), {
        displayName: newName,
        photoURL: newPhotoURL,
        email: currentUser.email,
        equippedBadges: finalEquipped,
        bio: newBio,
        accentColor: selectedAccent,
        avatarBorder: selectedBorder,
        pronouns: newPronouns,
        statusLine: newStatusLine
      }, { merge: true });

      myProfile = { ...(myProfile || {}), displayName: newName, photoURL: newPhotoURL, equippedBadges: finalEquipped, bio: newBio, accentColor: selectedAccent, avatarBorder: selectedBorder, pronouns: newPronouns, statusLine: newStatusLine };
      userCache.set(currentUser.uid, { ...(userCache.get(currentUser.uid) || {}), displayName: newName, photoURL: newPhotoURL, isDeveloper: (myProfile && myProfile.isDeveloper) || false, equippedBadges: finalEquipped, bio: newBio, accentColor: selectedAccent, avatarBorder: selectedBorder, pronouns: newPronouns, statusLine: newStatusLine });
      applyAccentColor(selectedAccent);

      renderAuthArea();
      closeAuthModal();
      showToast("Profile updated");
    } catch (err) {
      errorBox.textContent = "Couldn't save changes. Please try again.";
      errorBox.classList.add("show");
      console.error(err);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save changes";
    }
  });
}

/* ---------------- POSTS ---------------- */

let pendingPostMedia = null; // { dataUrl, type: "image"|"video" }

document.getElementById("attachMediaBtn").addEventListener("click", () => {
  document.getElementById("postMediaInput").click();
});

document.getElementById("postMediaInput").addEventListener("change", async () => {
  const file = document.getElementById("postMediaInput").files[0];
  const preview = document.getElementById("postMediaPreview");
  if (!file) return;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) { showToast("Only images and videos are supported."); return; }
  if (isImage && file.size > MAX_POST_IMAGE_BYTES) { showToast("Image must be under 10MB."); document.getElementById("postMediaInput").value = ""; return; }
  if (isVideo && file.size > MAX_POST_VIDEO_BYTES) { showToast("Video must be under 8MB to attach."); document.getElementById("postMediaInput").value = ""; return; }

  document.getElementById("attachMediaBtn").disabled = true;
  document.getElementById("attachMediaBtn").textContent = "Processing...";

  try {
    let dataUrl;
    if (isImage) {
      dataUrl = await compressPostImage(file);
    } else {
      dataUrl = await encodeVideoToBase64(file);
    }
    pendingPostMedia = { dataUrl, type: isImage ? "image" : "video" };
    const mediaEl = isImage
      ? `<img src="${dataUrl}" alt="Attached image">`
      : `<video src="${dataUrl}" controls muted playsinline></video>`;
    preview.innerHTML = `<div class="media-preview-wrap">${mediaEl}<button class="media-remove-btn" id="removeMediaBtn">&times;</button></div>`;
    document.getElementById("removeMediaBtn").addEventListener("click", () => {
      pendingPostMedia = null;
      preview.innerHTML = "";
      document.getElementById("postMediaInput").value = "";
    });
  } catch (err) {
    showToast(err.message || "Couldn't attach media.");
    document.getElementById("postMediaInput").value = "";
  } finally {
    document.getElementById("attachMediaBtn").disabled = false;
    document.getElementById("attachMediaBtn").innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>Attach';
  }
});

document.getElementById("cancelPostBtn").addEventListener("click", () => {
  document.getElementById("postTitle").value = "";
  document.getElementById("postBody").value = "";
  pendingPostMedia = null;
  document.getElementById("postMediaPreview").innerHTML = "";
  document.getElementById("postMediaInput").value = "";
});

document.getElementById("submitPostBtn").addEventListener("click", async () => {
  if (!currentUser) return openAuthModal("signin");
  const titleEl = document.getElementById("postTitle");
  const bodyEl = document.getElementById("postBody");
  const title = titleEl.value.trim();
  const body = bodyEl.value.trim();
  if (!title) { showToast("Add a title first"); titleEl.focus(); return; }

  const btn = document.getElementById("submitPostBtn");
  btn.disabled = true;
  btn.textContent = "Posting...";

  try {
    const myUserSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myIsDeveloper = myUserSnap.exists() && myUserSnap.data().isDeveloper === true;
    const myEquippedNow = myUserSnap.exists() && Array.isArray(myUserSnap.data().equippedBadges) ? myUserSnap.data().equippedBadges : [];
    const postData = {
      title, body,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email.split("@")[0],
      authorIsDeveloper: myIsDeveloper,
      authorEquippedBadges: myEquippedNow,
      createdAt: serverTimestamp(),
      score: 0,
      commentCount: 0
    };
    if (pendingPostMedia) {
      postData.mediaData = pendingPostMedia.dataUrl;
      postData.mediaType = pendingPostMedia.type;
    }
    await addDoc(collection(db, "posts"), postData);
    await setDoc(doc(db, "users", currentUser.uid), { postCount: increment(1) }, { merge: true });
    if (myProfile) myProfile.postCount = (myProfile.postCount || 0) + 1;

    const nowTs = Date.now();
    const prevDates = (myProfile && myProfile.recentPostDates) || [];
    const updatedDates = [...prevDates, nowTs].filter(ts => (nowTs - ts) <= (STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000)).slice(-20);
    await setDoc(doc(db, "users", currentUser.uid), { recentPostDates: updatedDates }, { merge: true });
    if (myProfile) myProfile.recentPostDates = updatedDates;
    const cachedMe = userCache.get(currentUser.uid);
    if (cachedMe) { cachedMe.postCount = (cachedMe.postCount || 0) + 1; cachedMe.recentPostDates = updatedDates; }
    titleEl.value = "";
    bodyEl.value = "";
    pendingPostMedia = null;
    document.getElementById("postMediaPreview").innerHTML = "";
    document.getElementById("postMediaInput").value = "";
    playShimmer(composerCard);
    showToast("Posted to the floor");
  } catch (err) {
    showToast("Couldn't post — try again");
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Post";
  }
});

document.querySelectorAll(".sort-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sort-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    renderFeed();
  });
});

function renderFeed() {
  if (allPosts.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <div class="display">The floor is quiet</div>
        <p>Be the first to leave a mark on the tiles.</p>
      </div>`;
    return;
  }

  const sorted = [...allPosts].sort((a, b) => {
    if (currentSort === "top") return (b.score || 0) - (a.score || 0);
    const aTime = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });

  feed.innerHTML = sorted.map(post => renderPost(post)).join("");

  sorted.forEach(post => attachPostListeners(post.id));
}

function renderPost(post) {
  const userVote = post._myVote || 0;
  const isCommentsOpen = openComments.has(post.id);
  const comments = post._comments || [];
  const liveAuthor = userCache.get(post.authorId);
  const authorName = (liveAuthor && liveAuthor.displayName) || post.authorName;
  const authorPhoto = liveAuthor && liveAuthor.photoURL;
  const authorIsDev = liveAuthor ? liveAuthor.isDeveloper : post.authorIsDeveloper;

  return `
    <div class="post" data-id="${post.id}">
      <div class="post-meta">
        ${avatarHtml(authorName, authorPhoto, 18, liveAuthor && liveAuthor.avatarBorder)}
        <span>${escapeHtml(authorName || "Someone")}</span>
        ${liveAuthor && liveAuthor.pronouns ? `<span style="font-size:0.72rem;opacity:0.55;">(${escapeHtml(liveAuthor.pronouns)})</span>` : ""}
        ${authorIsDev ? `<img src="assets/icons/devicon.png" alt="Developer" title="Developer" style="width:14px;height:14px;border-radius:4px;vertical-align:middle;">` : ""}
        ${badgeRowHtml(liveAuthor ? liveAuthor.equippedBadges : post.authorEquippedBadges, 14)}
        <span class="sep">&middot;</span>
        <span>${timeAgo(post.createdAt)}</span>
      </div>
      <h3>${escapeHtml(post.title)}</h3>
      ${post.body ? `<p class="body">${escapeHtml(post.body)}</p>` : ""}
      ${post.mediaData && post.mediaType === "image" ? `<div class="post-media"><img src="${post.mediaData}" alt="Post image" loading="lazy"></div>` : ""}
      ${post.mediaData && post.mediaType === "video" ? `<div class="post-media"><video src="${post.mediaData}" controls muted playsinline preload="metadata"></video></div>` : ""}
      <div class="reaction-bar" id="reactions-${post.id}">
        ${(["🔥","❤️","😂","😮","👏"]).map(emoji => {
          const count = (post._reactions && post._reactions[emoji]) || 0;
          const reacted = post._myReaction === emoji;
          return `<button class="reaction-btn${reacted ? " reacted" : ""}" data-emoji="${emoji}" data-id="${post.id}">${emoji}${count > 0 ? ` <span>${count}</span>` : ""}</button>`;
        }).join("")}
      </div>
      <div class="post-actions">
        <div class="vote-group">
          <button class="vote-btn upvote ${userVote === 1 ? "voted" : ""}" data-id="${post.id}" aria-label="Upvote">&#9650;</button>
          <span class="vote-count">${post.score || 0}</span>
          <button class="vote-btn downvote ${userVote === -1 ? "voted" : ""}" data-id="${post.id}" aria-label="Downvote">&#9660;</button>
        </div>
        <button class="icon-btn comment-toggle" data-id="${post.id}">
          💬 ${post.commentCount || 0}
        </button>
        ${currentUser && currentUser.uid === post.authorId ? `<button class="icon-btn delete-post" data-id="${post.id}">🗑 Delete</button>` : ""}
      </div>
      <div class="comments ${isCommentsOpen ? "open" : ""}" id="comments-${post.id}">
        <div class="comments-list">${renderCommentsListHtml(post.id, comments)}</div>
        ${currentUser ? `
          <div class="comment-form">
            <input type="text" placeholder="Add a comment&hellip;" maxlength="500" id="commentInput-${post.id}">
            <button data-id="${post.id}" class="send-comment">Send</button>
          </div>
        ` : `<p style="font-size:0.82rem;color:var(--ink-soft);margin-top:8px;">Sign in to join the conversation.</p>`}
      </div>
    </div>
  `;
}

function attachPostListeners(postId) {
  const root = document.querySelector(`.post[data-id="${postId}"]`);
  if (!root) return;

  root.querySelectorAll(".reaction-btn").forEach(btn => {
    btn.addEventListener("click", () => handleReaction(postId, btn.dataset.emoji, btn));
  });

  root.querySelector(".upvote").addEventListener("click", (e) => {
    e.currentTarget.classList.remove("pop");
    void e.currentTarget.offsetWidth;
    e.currentTarget.classList.add("pop");
    handleVote(postId, 1);
  });
  root.querySelector(".downvote").addEventListener("click", (e) => {
    e.currentTarget.classList.remove("pop");
    void e.currentTarget.offsetWidth;
    e.currentTarget.classList.add("pop");
    handleVote(postId, -1);
  });

  root.querySelector(".comment-toggle").addEventListener("click", () => {
    const panel = document.getElementById(`comments-${postId}`);
    if (openComments.has(postId)) {
      openComments.delete(postId);
      panel.classList.remove("open");
    } else {
      openComments.add(postId);
      panel.classList.add("open");
    }
  });

  const delBtn = root.querySelector(".delete-post");
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      if (!confirm("Delete this post?")) return;
      try {
        await deleteDoc(doc(db, "posts", postId));
        showToast("Post deleted");
      } catch (err) {
        showToast("Couldn't delete post");
      }
    });
  }

  const sendBtn = root.querySelector(".send-comment");
  if (sendBtn) {
    sendBtn.addEventListener("click", () => submitComment(postId));
    const input = root.querySelector(`#commentInput-${postId}`);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitComment(postId);
    });
  }
}

async function handleVote(postId, dir) {
  if (!currentUser) return openAuthModal("signin");
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;

  const voteRef = doc(db, "posts", postId, "votes", currentUser.uid);
  const existing = post._myVote || 0;
  const newVote = existing === dir ? 0 : dir;
  const delta = newVote - existing;

  // Only "upvotes received" count toward the popular badge — track the +1 state transition specifically.
  const wasUpvoted = existing === 1;
  const isNowUpvoted = newVote === 1;
  let upvoteDelta = 0;
  if (!wasUpvoted && isNowUpvoted) upvoteDelta = 1;
  else if (wasUpvoted && !isNowUpvoted) upvoteDelta = -1;

  try {
    if (newVote === 0) {
      await deleteDoc(voteRef);
    } else {
      await setDoc(voteRef, { value: newVote });
    }
    await updateDoc(doc(db, "posts", postId), { score: increment(delta) });
    if (upvoteDelta !== 0 && post.authorId) {
      await setDoc(doc(db, "users", post.authorId), { totalUpvotes: increment(upvoteDelta) }, { merge: true });
      const cachedAuthor = userCache.get(post.authorId);
      if (cachedAuthor) cachedAuthor.totalUpvotes = (cachedAuthor.totalUpvotes || 0) + upvoteDelta;
    }
  } catch (err) {
    showToast("Couldn't register vote");
  }
}

async function submitComment(postId) {
  if (!currentUser) return openAuthModal("signin");
  const input = document.getElementById(`commentInput-${postId}`);
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  try {
    const myUserSnap = await getDoc(doc(db, "users", currentUser.uid));
    const myIsDeveloper = myUserSnap.exists() && myUserSnap.data().isDeveloper === true;
    await addDoc(collection(db, "posts", postId, "comments"), {
      text,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email.split("@")[0],
      authorIsDeveloper: myIsDeveloper,
      authorEquippedBadges: (myProfile && myProfile.equippedBadges) || [],
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "posts", postId), { commentCount: increment(1) });
    await setDoc(doc(db, "users", currentUser.uid), { commentsMade: increment(1) }, { merge: true });
    if (myProfile) myProfile.commentsMade = (myProfile.commentsMade || 0) + 1;
    const cachedMe2 = userCache.get(currentUser.uid);
    if (cachedMe2) cachedMe2.commentsMade = (cachedMe2.commentsMade || 0) + 1;
    input.value = "";
  } catch (err) {
    showToast("Couldn't post comment");
  } finally {
    input.disabled = false;
  }
}

/* ---------------- LIVE DATA ---------------- */

function cleanupPostListeners(postIdsToKeep = new Set()) {
  for (const [postId, unsubscribe] of Object.entries(commentUnsubs)) {
    if (!postIdsToKeep.has(postId)) {
      unsubscribe?.();
      delete commentUnsubs[postId];
    }
  }
  for (const [postId, unsubscribe] of Object.entries(reactionUnsubs)) {
    if (!postIdsToKeep.has(postId)) {
      unsubscribe?.();
      delete reactionUnsubs[postId];
    }
  }
  for (const [postId, unsubscribe] of Object.entries(voteUnsubs)) {
    if (!postIdsToKeep.has(postId)) {
      unsubscribe?.();
      delete voteUnsubs[postId];
    }
  }
}

function resetUserVoteListeners() {
  Object.values(voteUnsubs).forEach(unsubscribe => unsubscribe?.());
  Object.keys(voteUnsubs).forEach(postId => delete voteUnsubs[postId]);
  allPosts.forEach(post => { post._myVote = 0; });
}

function listenToPosts() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const posts = [];
    snap.forEach(d => posts.push({ id: d.id, ...d.data() }));

    const prevIds = allPosts.map(p => p.id).join(",");
    const nextIds = posts.map(p => p.id).join(",");
    const idsChanged = prevIds !== nextIds;

    // preserve existing local state (comments/votes/reactions) already loaded
    posts.forEach(p => {
      const existing = allPosts.find(ep => ep.id === p.id);
      if (existing) {
        p._comments = existing._comments;
        p._myVote = existing._myVote;
        p._reactions = existing._reactions;
        p._myReaction = existing._myReaction;
      }
    });

    allPosts = posts;
    cleanupPostListeners(new Set(posts.map(post => post.id)));

    // Only rebuild the whole feed DOM when the set/order of posts actually changed
    // (new post, deleted post, sort change). In-place updates (votes, reactions,
    // comments) are handled by their own listeners and must never trigger this.
    if (idsChanged) {
      renderFeed();
    } else {
      // update score/commentCount text in place without touching the DOM tree
      posts.forEach(p => {
        const root = document.querySelector(`.post[data-id="${p.id}"]`);
        if (!root) return;
        const countEl = root.querySelector(".vote-count");
        if (countEl) countEl.textContent = p.score || 0;
        const commentToggle = root.querySelector(".comment-toggle");
        if (commentToggle) commentToggle.innerHTML = `💬 ${p.commentCount || 0}`;
      });
    }

    posts.forEach(p => {
      listenToComments(p.id);
      listenToReactions(p.id);
      if (currentUser) listenToMyVote(p.id);
      if (!userCache.has(p.authorId)) {
        getUserProfile(p.authorId).then(() => {
          const root = document.querySelector(`.post[data-id="${p.id}"]`);
          if (!root) return;
          const liveAuthor = userCache.get(p.authorId);
          if (!liveAuthor) return;
          const nameEl = root.querySelector(".post-meta span");
          if (nameEl && liveAuthor.displayName) nameEl.textContent = liveAuthor.displayName;
        });
      }
    });
  }, (error) => {
    console.error("Post listener failed:", error);
    showToast("Couldn't load the floor right now");
  });
}

const commentUnsubs = {};
function renderCommentsListHtml(postId, comments) {
  return comments.map(c => {
    const liveC = userCache.get(c.authorId);
    const cName = (liveC && liveC.displayName) || c.authorName;
    const cPhoto = liveC && liveC.photoURL;
    const cIsDev = liveC ? liveC.isDeveloper : c.authorIsDeveloper;
    return `
      <div class="comment">
        ${avatarHtml(cName, cPhoto, 22, liveC && liveC.avatarBorder)}
        <div class="comment-body">
          <div class="comment-meta">${escapeHtml(cName || "Someone")} ${cIsDev ? `<img src="assets/icons/devicon.png" alt="Developer" title="Developer" style="width:12px;height:12px;border-radius:3px;vertical-align:middle;">` : ""} ${badgeRowHtml(liveC ? liveC.equippedBadges : c.authorEquippedBadges, 12)} &middot; ${timeAgo(c.createdAt)}</div>
          <div class="comment-text">${escapeHtml(c.text)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function listenToComments(postId) {
  if (commentUnsubs[postId]) return;
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
  commentUnsubs[postId] = onSnapshot(q, (snap) => {
    const comments = [];
    snap.forEach(d => comments.push(d.data()));

    const post = allPosts.find(p => p.id === postId);
    if (post) post._comments = comments;

    const refreshCommentsList = () => {
      const panel = document.getElementById(`comments-${postId}`);
      if (!panel) return;
      const list = panel.querySelector(".comments-list");
      if (list) list.innerHTML = renderCommentsListHtml(postId, comments);
    };

    const missingAuthors = comments.filter(c => c.authorId && !userCache.has(c.authorId));
    if (missingAuthors.length > 0) {
      Promise.all(missingAuthors.map(c => getUserProfile(c.authorId))).then(refreshCommentsList);
    } else {
      refreshCommentsList();
    }

    const toggle = document.querySelector(`.post[data-id="${postId}"] .comment-toggle`);
    if (toggle) toggle.innerHTML = `💬 ${comments.length}`;
  });
}

const reactionUnsubs = {};
const REACTION_EMOJIS = ["🔥","❤️","😂","😮","👏"];

function listenToReactions(postId) {
  if (reactionUnsubs[postId]) return;
  reactionUnsubs[postId] = onSnapshot(
    collection(db, "posts", postId, "reactions"),
    (snap) => {
      const post = allPosts.find(p => p.id === postId);
      if (!post) return;
      const counts = {};
      snap.forEach(d => {
        const v = d.data().emoji;
        if (v) counts[v] = (counts[v] || 0) + 1;
      });
      post._reactions = counts;
      post._myReaction = currentUser
        ? (snap.docs.find(d => d.id === currentUser.uid)?.data().emoji || null)
        : null;
      const bar = document.getElementById(`reactions-${postId}`);
      if (bar) {
        bar.innerHTML = REACTION_EMOJIS.map(emoji => {
          const count = counts[emoji] || 0;
          const reacted = post._myReaction === emoji;
          return `<button class="reaction-btn${reacted ? " reacted" : ""}" data-emoji="${emoji}" data-id="${postId}">${emoji}${count > 0 ? ` <span>${count}</span>` : ""}</button>`;
        }).join("");
        bar.querySelectorAll(".reaction-btn").forEach(btn => {
          btn.addEventListener("click", () => handleReaction(postId, btn.dataset.emoji, btn));
        });
      }
    }
  );
}

async function handleReaction(postId, emoji, btn) {
  if (!currentUser) return openAuthModal("signin");
  btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop");
  const post = allPosts.find(p => p.id === postId);
  const reactionRef = doc(db, "posts", postId, "reactions", currentUser.uid);
  const isSame = post && post._myReaction === emoji;
  try {
    if (isSame) { await deleteDoc(reactionRef); }
    else { await setDoc(reactionRef, { emoji, uid: currentUser.uid }); }
  } catch (err) { showToast("Couldn't save reaction"); }
}

const voteUnsubs = {};
function listenToMyVote(postId) {
  if (!currentUser || voteUnsubs[postId]) return;
  const ref = doc(db, "posts", postId, "votes", currentUser.uid);
  voteUnsubs[postId] = onSnapshot(ref, (snap) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post._myVote = snap.exists() ? snap.data().value : 0;
      const root = document.querySelector(`.post[data-id="${postId}"]`);
      if (root) {
        const upBtn = root.querySelector(".upvote");
        const downBtn = root.querySelector(".downvote");
        const countEl = root.querySelector(".vote-count");
        if (upBtn) upBtn.classList.toggle("voted", post._myVote === 1);
        if (downBtn) downBtn.classList.toggle("voted", post._myVote === -1);
        if (countEl) countEl.textContent = post.score || 0;
      }
    }
  });
}

/* ---------------- AUTH STATE ---------------- */

onAuthStateChanged(auth, async (user) => {
  resetUserVoteListeners();
  currentUser = user;
  myProfile = null;
  if (user) {
    myProfile = await getUserProfile(user.uid, true);
    userCache.set(user.uid, myProfile);
  }
  renderAuthArea();
  if (user) {
    allPosts.forEach(p => listenToMyVote(p.id));
  }
});

/* ---------------- INIT ---------------- */

listenToPosts();
setTimeout(() => playShimmer(topbar), 300);
if (isAmbient3dEnabled()) ambient.start();

}
