const MAX_POSITIONS = 200;
const DISPLAY_LIMIT = 200;
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const CATEGORIES = ["Public Speaking", "Education", "University Partnership"];
const YEARS = [2025];
const POINT_VALUES = [4, 6, 8, 16, 32, 64, 96];

const FIRST_NAMES = [
  "Alex", "Avery", "Blake", "Cameron", "Casey", "Drew", "Eden", "Emery", "Finley", "Harper",
  "Hayden", "Jordan", "Kai", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Rowan", "Skyler"
];
const LAST_NAMES = [
  "Brooks", "Carter", "Diaz", "Ellis", "Foster", "Gray", "Hayes", "Ingram", "Jordan", "Keller",
  "Lane", "Morris", "Nolan", "Owens", "Perry", "Quincy", "Reid", "Shaw", "Turner", "Vance"
];
const ROLE_TITLES = [
  "QA Engineer", "Software Engineer", "Senior Software Engineer", "Frontend Engineer", "Data Analyst", "Product Manager"
];
const DEPARTMENTS = ["Engineering", "Product", "Quality", "Data", "Platform", "Operations"];
const COUNTRY_CODES = ["UZ", "KZ", "GE", "AZ", "PL", "DE", "NL", "SE", "FR", "ES"];
const AVATAR_COLORS = [
  "linear-gradient(145deg, #dce4f2, #bccce2)",
  "linear-gradient(145deg, #d9e1ef, #b8c9df)",
  "linear-gradient(145deg, #dce3ef, #b4c4da)",
  "linear-gradient(145deg, #dee5f1, #bdccdf)",
  "linear-gradient(145deg, #d9e0ec, #b3c2d8)",
  "linear-gradient(145deg, #d7e0ee, #b5c5dd)"
];

const AVATAR_VARIANTS = {
  woman:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#eef3fb'/><stop offset='100%' stop-color='#d9e2f1'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(%23bg)'/><path d='M48 19c10.4 0 18 8.3 18 19.3 0 5.5-2.2 10.1-5.5 13.4-3.1 3-7.7 4.8-12.5 4.8-4.8 0-9.4-1.8-12.5-4.8-3.3-3.3-5.5-7.9-5.5-13.4C30 27.3 37.6 19 48 19Z' fill='#c6d2e5'/><path d='M23 83c1.8-14.8 12.7-23.3 25-23.3S71.2 68.2 73 83' fill='#b6c5dd'/><path d='M33.8 42.4c2.7-12 11-18.5 23.4-18.5 7.2 0 11.8 4.2 13 10.3-3.6-.9-6.9-.4-9.5 1.4-3.7 2.6-6.6 5.4-12.2 5.4-4.6 0-8.5 1.7-14.7 1.4Z' fill='#d9e2f1' opacity='.95'/></svg>",
  man:
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#eef3fb'/><stop offset='100%' stop-color='#d9e2f1'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(%23bg)'/><path d='M48 22c10.8 0 17.5 8 17.5 18.5 0 10.6-7.6 18.4-17.5 18.4s-17.5-7.8-17.5-18.4C30.5 30 37.2 22 48 22Z' fill='#c6d2e5'/><path d='M22 83c2.3-13.7 12.7-21.7 26-21.7S71.7 69.3 74 83' fill='#b6c5dd'/><path d='M32.8 39.4c.7-12 7.9-19.4 18.8-19.4 8.4 0 13.8 4.3 15.6 11.4-4.4-.6-8.1.1-11.1 2.1-3.4 2.3-6.3 3.6-11.8 3.6-4.2 0-8.1.8-11.5 2.3Z' fill='#d9e2f1' opacity='.95'/></svg>"
};

const ACTIVITY_TEMPLATES = {
  "Public Speaking": [
    "[LAB] Tech talk on API design with {peer}",
    "[COMM] Demo session for cross-team review with {peer}",
    "[LAB] Lightning talk on delivery metrics with {peer}"
  ],
  Education: [
    "[LAB] Mentoring session with {peer}",
    "[LAB] Lecture on engineering fundamentals with {peer}",
    "[LAB] Workshop on test strategy with {peer}"
  ],
  "University Partnership": [
    "[UNI] Guest lecture with {peer}",
    "[UNI] Campus workshop with {peer}",
    "[UNI] Student project review with {peer}"
  ]
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function monthRangeForQuarter(quarter) {
  if (quarter === "Q1") return [1, 2, 3];
  if (quarter === "Q2") return [4, 5, 6];
  if (quarter === "Q3") return [7, 8, 9];
  return [10, 11, 12];
}

function buildDate(year, quarter, seed) {
  const months = monthRangeForQuarter(quarter);
  const month = months[seed % months.length];
  const day = (seed % 27) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function buildAvatarVariant(index) {
  return index % 2 === 0 ? AVATAR_VARIANTS.woman : AVATAR_VARIANTS.man;
}

function buildRoster(total) {
  return Array.from({ length: total }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
    const country = COUNTRY_CODES[(index * 7 + 3) % COUNTRY_CODES.length];
    const unit = (index % 9) + 1;
    const department = ((index * 3 + 2) % 9) + 1;
    const team = ((index * 5 + 1) % 9) + 1;
    const detailsCode = `${country}.U${unit}.D${department}.T${team}`;
    const role = `${ROLE_TITLES[index % ROLE_TITLES.length]} (${detailsCode})`;
    return {
      id: `user-${index + 1}`,
      name: `${first} ${last}`,
      role,
      department: DEPARTMENTS[index % DEPARTMENTS.length],
      color: AVATAR_COLORS[index % AVATAR_COLORS.length],
      avatarSvg: buildAvatarVariant(index)
    };
  });
}

function hash(a, b) {
  const h = ((a * 2654435761) ^ (b * 2246822519)) >>> 0;
  return h;
}

function buildActivities(roster, ownerIndex) {
  const count = 3 + (hash(ownerIndex, 0) % 13);
  const activities = [];

  for (let i = 0; i < count; i += 1) {
    const category = CATEGORIES[hash(ownerIndex, i * 3 + 1) % CATEGORIES.length];
    const quarter = QUARTERS[hash(ownerIndex, i * 5 + 2) % QUARTERS.length];
    const year = YEARS[hash(ownerIndex, i * 7 + 3) % YEARS.length];
    const peerIndexRaw = hash(ownerIndex, i * 11 + 5) % roster.length;
    const peerIndex = peerIndexRaw === ownerIndex ? (peerIndexRaw + 1) % roster.length : peerIndexRaw;
    const peer = roster[peerIndex];
    const template = ACTIVITY_TEMPLATES[category][hash(ownerIndex, i * 13 + 7) % ACTIVITY_TEMPLATES[category].length];
    const title = template.replace("{peer}", peer.name);

    activities.push({
      title,
      category,
      date: buildDate(year, quarter, hash(ownerIndex, i * 17 + 9) % 27),
      points: POINT_VALUES[hash(ownerIndex * 3, i * 19 + 11) % POINT_VALUES.length],
      year,
      quarter,
      relatedParticipantId: peer.id
    });
  }

  return activities;
}

const roster = buildRoster(MAX_POSITIONS);
const employees = roster.map((profile, index) => ({
  ...profile,
  activities: buildActivities(roster, index)
}));

const dom = {
  yearFilter: document.getElementById("yearFilter"),
  quarterFilter: document.getElementById("quarterFilter"),
  categoryFilter: document.getElementById("categoryFilter"),
  searchInput: document.getElementById("searchInput"),
  podiumWrap: document.querySelector(".podium-wrap"),
  podium: document.getElementById("podium"),
  leaderboardList: document.getElementById("leaderboardList")
};

const state = {
  year: "all",
  quarter: "all",
  category: "all",
  search: "",
  expandedEmployeeId: null
};

const iconDisplay = {
  speaking:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.25" y="4.75" width="13.5" height="8.5" rx="1.3" stroke="currentColor" stroke-width="1.7"/><path d="M12 13.75v3.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8.8 18.25h6.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.3 16.85h5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  education:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.2 9.3L12 4l8.8 5.3L12 14.6 3.2 9.3z" stroke="currentColor" stroke-width="1.8"/><path d="M7.7 12.1v4.5c0 .8 1.9 2.3 4.3 2.3s4.3-1.5 4.3-2.3v-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  partnership:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M9 10h.01M15 10h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8.5 14.3c.9 1.1 2 1.7 3.5 1.7s2.6-.6 3.5-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

const chevronDown =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chevronUp =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function uniqueValues(selector) {
  const values = new Set();
  for (const employee of employees) {
    for (const item of employee.activities) {
      values.add(selector(item));
    }
  }
  return Array.from(values);
}

function setupFilters() {
  const years = uniqueValues((item) => item.year).sort((a, b) => b - a);
  const quarters = QUARTERS;
  const categories = CATEGORIES;

  for (const year of years) {
    dom.yearFilter.insertAdjacentHTML("beforeend", `<option value="${year}">${year}</option>`);
  }
  for (const quarter of quarters) {
    dom.quarterFilter.insertAdjacentHTML("beforeend", `<option value="${quarter}">${quarter}</option>`);
  }
  for (const category of categories) {
    dom.categoryFilter.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`);
  }

  dom.yearFilter.addEventListener("change", (event) => {
    state.year = event.target.value;
    state.expandedEmployeeId = null;
    render();
  });
  dom.quarterFilter.addEventListener("change", (event) => {
    state.quarter = event.target.value;
    state.expandedEmployeeId = null;
    render();
  });
  dom.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    state.expandedEmployeeId = null;
    render();
  });
  dom.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });
}

function inFilter(activity) {
  const byYear = state.year === "all" || Number(state.year) === activity.year;
  const byQuarter = state.quarter === "all" || state.quarter === activity.quarter;
  const byCategory = state.category === "all" || state.category === activity.category;
  return byYear && byQuarter && byCategory;
}

function getRankedEmployees() {
  const mapped = [];

  for (const employee of employees) {
    const activities = employee.activities.filter(inFilter);
    if (!activities.length) {
      continue;
    }

    const totalPoints = activities.reduce((sum, item) => sum + item.points, 0);
    const speaking = activities.filter((item) => item.category === "Public Speaking").length;
    const education = activities.filter((item) => item.category === "Education").length;
    const partnership = activities.filter((item) => item.category === "University Partnership").length;

    mapped.push({
      ...employee,
      visibleActivities: activities.sort((a, b) => new Date(b.date) - new Date(a.date)),
      totalPoints,
      speaking,
      education,
      partnership
    });
  }

  return mapped.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.name.localeCompare(b.name);
  }).map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}

function getSearchedEmployees(rankedEmployees) {
  if (!state.search) {
    return rankedEmployees;
  }

  return rankedEmployees.filter((employee) => {
    const fulltext = `${employee.name} ${employee.role}`.toLowerCase();
    return fulltext.includes(state.search);
  });
}

function renderPodium(list) {
  const topThree = list.filter((item) => item.rank <= 3);

  if (!topThree.length) {
    dom.podiumWrap.style.display = "none";
    dom.podium.innerHTML = "";
    return;
  }

  dom.podiumWrap.style.display = "block";

  const byRank = [2, 1, 3]
    .map((rank) => ({ rank, item: topThree.find((entry) => entry.rank === rank) }))
    .filter((entry) => entry.item);

  dom.podium.innerHTML = byRank
    .map(({ rank, item }) => {
      const safeName = escapeHtml(item.name);
      const safeRole = escapeHtml(item.role);
      return `
      <article class="podium-card">
        <div class="avatar" style="background:${item.color}">
          ${item.avatarSvg}
          <span class="badge-rank rank-${rank}">${rank}</span>
        </div>
        <div class="podium-name">${safeName}</div>
        <div class="podium-role">${safeRole}</div>
        <div class="points-pill rank-${rank}"><span>★</span><span>${item.totalPoints}</span></div>
        <div class="podium-base rank-${rank}">${rank}</div>
      </article>`;
    })
    .join("");
}

function statItem(iconKey, value) {
  if (!value) {
    return "";
  }
  return `<div class="stat-item">${iconDisplay[iconKey]}<span class="value">${value}</span></div>`;
}

function renderRowAvatar(item) {
  return `<div class="row-avatar" style="background:${item.color}">${item.avatarSvg}</div>`;
}

function renderRows(list) {
  if (!list.length) {
    dom.leaderboardList.innerHTML = '<div class="empty-state">No employees match these filters yet.</div>';
    return;
  }

  dom.leaderboardList.innerHTML = list
    .map((item) => {
      const rank = item.rank;
      const expanded = state.expandedEmployeeId === item.id;
      const safeName = escapeHtml(item.name);
      const safeMeta = escapeHtml(item.role);
      const activities = expanded ? renderActivity(item.visibleActivities) : "";

      return `
      <article class="row-card ${expanded ? "expanded" : ""}">
        <div class="row-main">
          <div class="row-rank">${rank}</div>
          ${renderRowAvatar(item)}
          <div>
            <div class="row-name">${safeName}</div>
            <div class="row-meta">${safeMeta}</div>
          </div>
          <div class="stats">
            ${statItem("speaking", item.speaking)}
            ${statItem("education", item.education)}
            ${statItem("partnership", item.partnership)}
          </div>
          <div class="total-wrap">
            <div>
              <div class="total-label">TOTAL</div>
              <div class="total-score">★ ${item.totalPoints}</div>
            </div>
          </div>
          <button class="toggle-btn" type="button" data-id="${item.id}" aria-label="Toggle activity details">
            ${expanded ? chevronUp : chevronDown}
          </button>
        </div>
        ${activities}
      </article>`;
    })
    .join("");

  dom.leaderboardList.querySelectorAll(".toggle-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const employeeId = button.dataset.id;
      state.expandedEmployeeId = state.expandedEmployeeId === employeeId ? null : employeeId;
      render();
    });
  });
}

function renderActivity(activities) {
  const rows = activities
    .map((item) => {
      const safeTitle = escapeHtml(item.title);
      const safeCategory = escapeHtml(item.category);
      const dateText = formatDate(item.date);
      return `
        <tr>
          <td>${safeTitle}</td>
          <td><span class="category-pill">${safeCategory}</span></td>
          <td>${dateText}</td>
          <td class="points">+${item.points}</td>
        </tr>`;
    })
    .join("");

  return `
    <div class="activity-wrap">
      <h3 class="activity-title">RECENT ACTIVITY</h3>
      <table class="activity-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Category</th>
            <th>Date</th>
            <th style="text-align:right;">Points</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

function formatDate(value) {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  const rankedEmployees = getRankedEmployees();
  const visible = getSearchedEmployees(rankedEmployees).slice(0, DISPLAY_LIMIT);
  renderPodium(visible);
  renderRows(visible);
}

setupFilters();
render();
