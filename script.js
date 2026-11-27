/* 2026 SMCS Senior Symposium — site logic (no dependencies). */
(function () {
  "use strict";

  const D = SYMPOSIUM;
  const PROJECTS = D.projects;
  const BY_ID = new Map(PROJECTS.map((p) => [p.id, p]));
  const STORAGE_KEY = "smcs-symposium-2026-itinerary";

  const TOPIC_COLOR = {
    "Computer Science & AI": "var(--t-cs)",
    "Biology & Biotech": "var(--t-bio)",
    "Engineering & Robotics": "var(--t-eng)",
    "Physics & Quantum": "var(--t-phys)",
    "Chemistry & Materials Science": "var(--t-chem)",
    Mathematics: "var(--t-math)",
    "Earth & Space Science": "var(--t-earth)",
    "Finance & Economics": "var(--t-fin)",
  };

  // Common abbreviations so searches like "APL", "JHU", "UMBC" or "Goddard" all work.
  const ORG_ALIASES = [
    [/NIST/, "nist national institute of standards and technology"],
    [/UMBC|Baltimore County/, "umbc university of maryland baltimore county"],
    [/University of Maryland(?!, Baltimore County)|UMD/, "umd university of maryland college park"],
    [/Applied Physics Laboratory|APL/, "jhu apl johns hopkins applied physics laboratory"],
    [/Johns Hopkins|JHU/, "jhu johns hopkins"],
    [/Catholic University|CUA/, "cua catholic university of america"],
    [/Goddard/, "nasa gsfc goddard"],
    [/George Mason|GMU/, "gmu george mason"],
    [/George Washington|GWU/, "gwu george washington"],
    [/Carnegie Mellon|CMU/, "cmu carnegie mellon"],
  ];

  const DAY_KEYS = Object.keys(D.days);
  const PILL_LIMIT = 4; // filter rows longer than this collapse behind "+N more"

  // Open on the most recent symposium day that has started (local time), else Day 1.
  function autoDay() {
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    let pick = DAY_KEYS[0];
    DAY_KEYS.forEach((k) => {
      if (D.days[k].date && D.days[k].date <= today) pick = k;
    });
    return pick;
  }

  // ───────── State ─────────
  const state = {
    view: "schedule",
    day: autoDay(),
    filtersOpen: false,
    expanded: new Set(),
    q: "",
    mine: false,
    filters: { day: new Set(), period: new Set(), room: new Set(), topic: new Set(), tech: new Set(), domain: new Set() },
    starred: loadStarred(),
  };

  // ───────── Helpers ─────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Lowercase, strip accents, turn punctuation into spaces (for word-start matching).
  const words = (s) => " " + norm(s).replace(/[^a-z0-9]+/g, " ").trim() + " ";

  function loadStarred() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw.filter((id) => BY_ID.has(id)) : []);
    } catch (e) {
      return new Set();
    }
  }
  function saveStarred() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.starred]));
    } catch (e) {
      /* storage may be unavailable (private mode) — keep in memory */
    }
  }

  function roomLabel(key) {
    return D.rooms[key].label;
  }
  function slotText(s, withDay = true) {
    const day = D.days[s.day];
    return (withDay ? `${day.weekday}, ${day.short}, ` : "") + `period ${s.period}, ${roomLabel(s.room)}`;
  }

  // Precompute search text for each project.
  PROJECTS.forEach((p) => {
    let aliases = "";
    ORG_ALIASES.forEach(([re, words]) => {
      if (re.test(p.org)) aliases += " " + words;
    });
    p._search = words(
      [p.name, p.title, p.org, p.mentors, p.summary, p.topic, p.tech, p.domain, aliases].join(" ")
    );
    p._color = TOPIC_COLOR[p.topic] || "var(--accent-2)";
  });

  // ───────── Filtering ─────────
  function slotMatches(s) {
    const f = state.filters;
    // The Day filter only applies in the All Projects view; the schedule uses the day tabs.
    const useDay = state.view === "explore" && f.day.size;
    return (
      (!useDay || f.day.has(String(s.day))) &&
      (!f.period.size || f.period.has(String(s.period))) &&
      (!f.room.size || f.room.has(s.room))
    );
  }

  function projectMatches(p) {
    const f = state.filters;
    if (state.mine && !state.starred.has(p.id)) return false;
    if (f.topic.size && !f.topic.has(p.topic)) return false;
    if (f.tech.size && !f.tech.has(p.tech)) return false;
    if (f.domain.size && !f.domain.has(p.domain)) return false;
    if (!p.slots.some(slotMatches)) return false;
    if (state.q) {
      // Every search word must match the start of some word in the project.
      const terms = words(state.q).trim().split(" ").filter(Boolean);
      if (!terms.every((t) => p._search.includes(" " + t))) return false;
    }
    return true;
  }

  function activeFilterCount() {
    return Object.entries(state.filters).reduce(
      (n, [k, s]) => n + (k === "day" && state.view !== "explore" ? 0 : s.size),
      0
    );
  }
  const isFiltering = () => activeFilterCount() > 0 || !!state.q || state.mine;

  // ───────── Filter pills ─────────
  const FILTER_OPTIONS = {
    day: Object.entries(D.days).map(([k, d]) => ({ value: k, label: `${d.weekday}, ${d.short}` })),
    period: D.periods.map((p) => ({ value: String(p), label: `Period ${p}` })),
    room: D.roomOrder.map((k) => ({
      value: k,
      label: D.rooms[k].host ? `${D.rooms[k].label} (${D.rooms[k].host})` : D.rooms[k].label,
    })),
    topic: D.taxonomy.topic.map((t) => ({ value: t, label: t })),
    tech: D.taxonomy.tech.map((t) => ({ value: t, label: t })),
    domain: D.taxonomy.domain.map((t) => ({ value: t, label: t })),
  };

  function buildPills() {
    document.querySelectorAll(".filter-group").forEach((group) => {
      const key = group.dataset.key;
      const wrap = $(".pills", group);
      const opts = FILTER_OPTIONS[key];
      const collapsible = opts.length > PILL_LIMIT + 1;
      wrap.innerHTML =
        opts
          .map(
            (o, i) =>
              `<button type="button" class="pill${collapsible && i >= PILL_LIMIT ? " extra" : ""}" data-key="${key}" data-value="${esc(o.value)}" aria-pressed="false">` +
              (o.color ? `<span class="swatch" style="background:${o.color}"></span>` : "") +
              `${esc(o.label)}</button>`
          )
          .join("") +
        (collapsible ? `<button type="button" class="pill more-btn" data-more="${key}"></button>` : "");
    });
  }

  function syncPills() {
    document.querySelectorAll(".filter-group").forEach((group) => {
      const key = group.dataset.key;
      const open = state.expanded.has(key);
      group.hidden = group.hasAttribute("data-explore-only") && state.view !== "explore";
      let hiddenCount = 0;
      group.querySelectorAll(".pill[data-value]").forEach((b) => {
        const on = state.filters[key].has(b.dataset.value);
        b.setAttribute("aria-pressed", String(on));
        // Collapsed rows still show any selected option.
        const hide = b.classList.contains("extra") && !open && !on;
        b.hidden = hide;
        if (hide) hiddenCount++;
      });
      const more = $(".more-btn", group);
      if (more) {
        more.hidden = !open && hiddenCount === 0;
        more.textContent = open ? "Show less" : `+${hiddenCount} more`;
        more.setAttribute("aria-expanded", String(open));
      }
    });
    const n = activeFilterCount();
    const badge = $("#filter-count");
    badge.hidden = n === 0;
    badge.textContent = n;
    $("#filters").hidden = !state.filtersOpen;
    $("#filters-toggle").setAttribute("aria-expanded", String(state.filtersOpen));
  }

  // ───────── Day tabs ─────────
  function dayMatchCount(visible, dayKey) {
    return visible.filter((p) => p.slots.some((s) => String(s.day) === dayKey && slotMatches(s))).length;
  }

  function renderDayTabs(visible) {
    const filtering = isFiltering();
    $("#day-bar .day-tabs").innerHTML = DAY_KEYS.map((k) => {
      const d = D.days[k];
      const n = dayMatchCount(visible, k);
      const badge = filtering
        ? `, <span class="day-count${n ? "" : " none"}">${n ? `${n} match${n === 1 ? "" : "es"}` : "no matches"}</span>`
        : "";
      return `<button type="button" role="tab" class="day-tab" data-day="${k}" aria-selected="${state.day === k}">
        <span class="day-tab-date">${esc(d.weekday)}, ${esc(d.short)}</span>
        <span class="day-tab-sub">Day ${k}${badge}</span>
      </button>`;
    }).join("");
  }

  // ───────── Rendering: shared pieces ─────────
  function starButton(p, extraClass = "") {
    const on = state.starred.has(p.id);
    return `<button type="button" class="star-btn ${extraClass}" data-star="${p.id}" aria-pressed="${on}"
      aria-label="${on ? "Remove" : "Add"} ${esc(p.name)} ${on ? "from" : "to"} My Schedule"
      title="${on ? "Remove from" : "Add to"} My Schedule">${on ? "★" : "☆"}</button>`;
  }

  // ───────── Schedule view ─────────
  function renderSchedule(visible) {
    const visibleIds = new Set(visible.map((p) => p.id));
    // Build index: day -> period -> room -> [{p, slot}]
    const idx = {};
    PROJECTS.forEach((p) => {
      if (!visibleIds.has(p.id)) return;
      p.slots.forEach((s) => {
        if (!slotMatches(s)) return;
        ((((idx[s.day] ||= {})[s.period] ||= {})[s.room] ||= [])).push({ p, s });
      });
    });

    let html = "";
    [state.day].forEach((dayKey) => {
      const day = idx[dayKey];
      if (!day) {
        const other = DAY_KEYS.find((k) => k !== dayKey && idx[k]);
        html +=
          `<div class="empty"><p class="empty-title">No matches on ${esc(D.days[dayKey].label)}.</p>` +
          (other
            ? `<p><button type="button" class="link-btn" data-day="${other}">See ${dayMatchCount(visible, other)} on ${esc(D.days[other].label)}</button></p>`
            : "") +
          `</div>`;
        return;
      }
      html += `<section class="day-section"><h2 class="visually-hidden">${esc(D.days[dayKey].label)}</h2>`;
      D.periods.forEach((period) => {
        const rooms = day[period];
        if (!rooms) return;
        const shownRooms = D.roomOrder.filter((r) => !state.filters.room.size || state.filters.room.has(r));

        // Conflict: starred talks this period in more than one room.
        const starredRooms = new Set();
        D.roomOrder.forEach((r) => (rooms[r] || []).forEach(({ p }) => state.starred.has(p.id) && starredRooms.add(r)));
        const conflict =
          starredRooms.size > 1
            ? `<span class="conflict" title="You starred talks in different rooms during this period">Your starred talks are in ${starredRooms.size} rooms</span>`
            : "";

        html += `<article class="period"><div class="period-head"><h3>Period ${period}</h3>${conflict}</div>
          <div class="rooms" style="--cols:${shownRooms.length}">`;
        shownRooms.forEach((r) => {
          const info = D.rooms[r];
          const talks = (rooms[r] || []).sort((a, b) => a.s.order - b.s.order);
          html += `<div class="room"><div class="room-head"><span class="room-name">${esc(info.label)}</span>
            ${info.host ? `<span class="room-host">${esc(info.host)}</span>` : ""}</div>`;
          if (!talks.length) html += `<div class="room-empty">No matching talks</div>`;
          talks.forEach(({ p, s }) => {
            const starred = state.starred.has(p.id);
            html += `<div class="talk ${starred ? "is-starred" : ""}">
              <span class="talk-room" aria-hidden="true">${esc(info.short || info.label)}</span>
              <button type="button" class="talk-main" data-open="${p.id}">
                <span class="talk-name">${esc(p.name)}</span>
                <span class="talk-title">${esc(p.title)}</span>
                <span class="talk-topic">${esc(p.topic)}</span>
              </button>${starButton(p)}</div>`;
          });
          html += `</div>`;
        });
        html += `</div></article>`;
      });
      html += `</section>`;
    });
    $("#view-schedule").innerHTML = html;
  }

  // ───────── Explore view ─────────
  function renderGrid(visible) {
    const sorted = [...visible].sort((a, b) => a.name.split(" ").slice(-1)[0].localeCompare(b.name.split(" ").slice(-1)[0]));
    $("#grid").innerHTML = sorted
      .map(
        (p) => `<article class="card">
          <button type="button" class="card-open" data-open="${p.id}">
            <h3 class="card-title">${esc(p.title)}</h3>
            <span class="card-name">${esc(p.name)}</span>
            <span class="card-org">${esc(p.org)}</span>
            <span class="card-topic">${esc(p.topic)}</span>
            <span class="card-meta">
              ${p.slots.map((s) => `<span class="chip slot">${esc(D.days[s.day].weekday)} ${esc(D.days[s.day].short)}, period ${s.period}, ${esc(roomLabel(s.room))}</span>`).join("")}
              <span class="chip">${esc(p.tech)}</span>
              <span class="chip">${esc(p.domain)}</span>
            </span>
          </button>
          ${starButton(p)}
        </article>`
      )
      .join("");
  }

  // ───────── Main render ─────────
  function render() {
    const visible = PROJECTS.filter(projectMatches);
    const isSchedule = state.view === "schedule";

    $("#view-schedule").hidden = !isSchedule || !visible.length;
    $("#view-explore").hidden = isSchedule || !visible.length;
    $("#day-bar").hidden = !isSchedule;
    if (isSchedule) {
      renderDayTabs(visible);
      renderSchedule(visible);
    }
    else renderGrid(visible);

    // Empty state
    const empty = $("#empty");
    empty.hidden = visible.length > 0;
    if (!visible.length) {
      $("#empty-hint").textContent =
        state.mine && state.starred.size === 0
          ? "You haven't starred any talks yet. Tap ☆ on any presentation to add it to My Schedule."
          : "Try a different search or clear some filters.";
    }

    // Counts
    const n = visible.length;
    $("#result-count").textContent =
      n === PROJECTS.length && !state.mine ? `${n} presentations` : `${n} of ${PROJECTS.length} match`;
    $("#clear-filters").hidden = !isFiltering();
    $("#mine-count").textContent = state.starred.size;
    $("#mine-toggle").setAttribute("aria-pressed", String(state.mine));
    document.querySelectorAll(".view-btn").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
    syncPills();
  }

  // ───────── Related projects ─────────
  function related(p, count = 3) {
    // Deterministic tiebreak so recommendations are stable but varied.
    const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    return PROJECTS.filter((o) => o.id !== p.id)
      .map((o) => {
        const why = [];
        let score = 0;
        if (o.topic === p.topic) { score += 3; why.push(o.topic); }
        if (o.tech === p.tech) { score += 2.5; why.push(o.tech); }
        if (o.domain === p.domain) { score += 2; why.push(o.domain); }
        return { o, score, why, tie: hash(p.id + o.id) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.tie - b.tie)
      .slice(0, count);
  }

  // ───────── Modal ─────────
  const modal = $("#modal");
  let lastFocus = null;

  function openModal(id, { push = true } = {}) {
    const p = BY_ID.get(id);
    if (!p) return;
    if (!modal.open) lastFocus = document.activeElement;
    const starred = state.starred.has(p.id);
    const rel = related(p);

    $("#modal-body").innerHTML = `
      <div class="modal-top">
        <button type="button" class="icon-btn ${starred ? "starred" : ""}" data-star="${p.id}" aria-pressed="${starred}">
          ${starred ? "★ In My Schedule" : "☆ Add to My Schedule"}
        </button>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="modal-content" style="--topic:${p._color}">
        <div class="modal-topic">${esc(p.topic)}</div>
        <h2 id="modal-title">${esc(p.title)}</h2>
        <p class="modal-name">${esc(p.name)}</p>
        <p class="modal-summary">${esc(p.summary)}</p>
        <dl class="facts">
          <dt>When &amp; where</dt>
          <dd>${p.slots.map((s) => `<span class="slot-line">${esc(slotText(s))} (${s.order === 1 ? "1st" : "2nd"} talk)</span>`).join("")}</dd>
          <dt>Internship</dt><dd>${esc(p.org)}</dd>
          <dt>Mentor${/,/.test(p.mentors) ? "s" : ""}</dt><dd>${esc(p.mentors)}</dd>
        </dl>
        <div class="tag-row">
          <button type="button" class="tag-btn" data-tag="topic" data-value="${esc(p.topic)}"><span class="tag-kind">Topic</span>${esc(p.topic)}</button>
          <button type="button" class="tag-btn" data-tag="tech" data-value="${esc(p.tech)}"><span class="tag-kind">Tech</span>${esc(p.tech)}</button>
          <button type="button" class="tag-btn" data-tag="domain" data-value="${esc(p.domain)}"><span class="tag-kind">Application</span>${esc(p.domain)}</button>
        </div>
        ${
          rel.length
            ? `<div class="related"><h3>Related presentations</h3><div class="related-list">
          ${rel
            .map(
              ({ o, why }) => `<button type="button" class="related-item" style="--topic:${o._color}" data-open="${o.id}">
                <span class="related-name">${esc(o.name)}</span>
                <span class="related-title">${esc(o.title)}</span>
                <span class="related-why">Shares <em>${esc(why.join(", "))}</em>. ${esc(o.slots.map((s) => slotText(s)).join("; "))}</span>
              </button>`
            )
            .join("")}
        </div></div>`
            : ""
        }
      </div>`;

    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
    if (push && location.hash !== "#" + p.id) history.pushState({ id: p.id }, "", "#" + p.id);
  }

  function closeModal({ fromPop = false } = {}) {
    if (!modal.open) return;
    modal.close();
  }

  modal.addEventListener("close", () => {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });
  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  window.addEventListener("popstate", () => {
    const id = location.hash.slice(1);
    if (id && BY_ID.has(id)) openModal(id, { push: false });
    else closeModal({ fromPop: true });
  });

  // ───────── Toast ─────────
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  function toggleStar(id) {
    const p = BY_ID.get(id);
    if (state.starred.has(id)) {
      state.starred.delete(id);
      toast(`Removed ${p.name} from My Schedule`);
    } else {
      state.starred.add(id);
      toast(`Added ${p.name} to My Schedule`);
    }
    saveStarred();
    render();
    if (modal.open) openModal(id, { push: false });
  }

  // ───────── Events ─────────
  document.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star]");
    if (star) {
      e.preventDefault();
      toggleStar(star.dataset.star);
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      openModal(open.dataset.open);
      return;
    }
    if (e.target.closest("[data-close]")) {
      closeModal();
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      const { tag: key, value } = tag.dataset;
      Object.values(state.filters).forEach((s) => s.clear());
      state.q = "";
      state.mine = false;
      $("#search").value = "";
      state.filters[key].add(value);
      state.view = "explore";
      state.filtersOpen = true;
      closeModal();
      render();
      $("#toolbar").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const dayBtn = e.target.closest("[data-day]");
    if (dayBtn) {
      state.day = dayBtn.dataset.day;
      render();
      // If scrolled into the schedule, jump back to the top of the newly selected day.
      const barH = $("#day-bar").offsetHeight;
      const top = $("#main").getBoundingClientRect().top;
      if (top < barH) window.scrollTo({ top: window.scrollY + top - barH, behavior: "smooth" });
      return;
    }
    const more = e.target.closest("[data-more]");
    if (more) {
      const k = more.dataset.more;
      state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k);
      syncPills();
      return;
    }
    if (e.target.closest("#filters-toggle")) {
      state.filtersOpen = !state.filtersOpen;
      syncPills();
      return;
    }
    const pill = e.target.closest(".pill");
    if (pill) {
      const set = state.filters[pill.dataset.key];
      const v = pill.dataset.value;
      set.has(v) ? set.delete(v) : set.add(v);
      render();
      return;
    }
    const viewBtn = e.target.closest(".view-btn");
    if (viewBtn) {
      state.view = viewBtn.dataset.view;
      render();
    }
  });

  $("#mine-toggle").addEventListener("click", () => {
    state.mine = !state.mine;
    render();
  });

  let searchTimer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      render();
    }, 80);
  });

  $("#clear-filters").addEventListener("click", () => {
    Object.values(state.filters).forEach((s) => s.clear());
    state.q = "";
    state.mine = false;
    $("#search").value = "";
    render();
  });

  // Keep starred talks in sync across tabs.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      state.starred = loadStarred();
      render();
    }
  });

  // ───────── Init ─────────
  buildPills();
  $("#stat-talks").textContent = PROJECTS.length;
  render();
  const initial = location.hash.slice(1);
  if (initial && BY_ID.has(initial)) openModal(initial, { push: false });
})();
