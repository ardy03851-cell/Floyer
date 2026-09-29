export function showToast(toastEl, message, duration = 2200) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(toastEl._hideTimer);
  toastEl._hideTimer = window.setTimeout(() => toastEl.classList.remove("show"), duration);
}

export function playShimmer(element) {
  if (!element) return;
  element.classList.remove("shimmer-play");
  void element.offsetWidth;
  element.classList.add("shimmer-play");
  element.addEventListener("animationend", () => element.classList.remove("shimmer-play"), { once: true });
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "?") + (parts[1]?.[0] || "");
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

export function avatarHtml(name, photoURL, sizePx = 26, avatarBorder = "none") {
  const size = sizePx || 26;
  const borderStyles = {
    none: "",
    ring: "box-shadow:0 0 0 2px var(--vein);",
    double: "box-shadow:0 0 0 2px var(--floor),0 0 0 4px var(--vein);"
  };
  const borderStyle = borderStyles[avatarBorder] || "";

  if (photoURL) {
    return `<span class="avatar-circle" style="width:${size}px;height:${size}px;padding:0;overflow:hidden;${borderStyle}"><img src="${escapeHtml(photoURL)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></span>`;
  }

  return `<span class="avatar-circle" style="width:${size}px;height:${size}px;font-size:${Math.max(10, size * 0.4)}px;${borderStyle}">${escapeHtml(initials(name).toUpperCase())}</span>`;
}

export function timeAgo(timestamp) {
  if (!timestamp) return "just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export const ACCENTS = {
  slate: ["#8E97A8", "#6F7A8E"],
  rose: ["#B07080", "#8E5565"],
  sage: ["#7A9E87", "#5C7D69"],
  amber: ["#A8946A", "#8A7450"],
  plum: ["#9B7FAE", "#7A618C"],
  ink: ["#6B6862", "#4A4742"]
};

export function applyAccentColor(color = "slate") {
  const [vein, veinDeep] = ACCENTS[color] || ACCENTS.slate;
  document.documentElement.style.setProperty("--vein", vein);
  document.documentElement.style.setProperty("--vein-deep", veinDeep);
}
