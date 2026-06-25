const SESSION_KEY = "today-eat-session-v2";
const ACTIVE_LIST_KEY = "today-eat-active-list-v1";
const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;
const DEFAULT_LIST_NAMES = ["公司附近", "团建聚餐"];
const ADMIN_USERNAME = "豆瓣酱";
const ADMIN_PIN = "0510";

const config = window.TODAY_EAT_SUPABASE || {};
const supabaseReady =
  window.supabase &&
  config.url &&
  config.anonKey &&
  !String(config.url).includes("YOUR_") &&
  !String(config.anonKey).includes("YOUR_");
const db = supabaseReady ? window.supabase.createClient(config.url, config.anonKey) : null;

const state = {
  currentUser: loadSession(),
  lists: [],
  selectedListId: localStorage.getItem(ACTIVE_LIST_KEY) || "",
  activeListId: localStorage.getItem(ACTIVE_LIST_KEY) || "",
  restaurants: [],
  collections: [],
  adminUsers: [],
  adminPinVerified: false,
  busy: false,
  activePage: 0,
};

let editingId = "";
let pendingAttachment = null;
let pendingAddValue = null;
let pendingImportCollectionId = "";
let wheelRotationDeg = 0;
let visibleShareListId = "";
let activeCollectionDetailId = "";
let activeRestaurantListDetailId = "";

const els = {
  authCard: document.getElementById("authCard"),
  authForm: document.getElementById("authForm"),
  usernameInput: document.getElementById("usernameInput"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),
  authMessage: document.getElementById("authMessage"),
  sessionCard: document.getElementById("sessionCard"),
  currentUsername: document.getElementById("currentUsername"),
  logoutBtn: document.getElementById("logoutBtn"),
  mainContent: document.getElementById("mainContent"),
  pageSlider: document.getElementById("pageSlider"),
  pageTrack: document.getElementById("pageTrack"),
  pageDots: document.getElementById("pageDots"),
  listSelectWrap: document.getElementById("listSelectWrap"),
  listSelectTrigger: document.getElementById("listSelectTrigger"),
  listSelectLabel: document.getElementById("listSelectLabel"),
  listSelectMenu: document.getElementById("listSelectMenu"),
  restaurantCount: document.getElementById("restaurantCount"),
  wheel: document.getElementById("wheel"),
  spinBtn: document.getElementById("spinBtn"),
  resultCard: document.getElementById("resultCard"),
  resultModalBackdrop: document.getElementById("resultModalBackdrop"),
  resultName: document.getElementById("resultName"),
  resultFood: document.getElementById("resultFood"),
  closeResultBtn: document.getElementById("closeResultBtn"),
  form: document.getElementById("restaurantForm"),
  submitBtn: document.getElementById("submitBtn"),
  nameInput: document.getElementById("nameInput"),
  foodInput: document.getElementById("foodInput"),
  cuisineInput: document.getElementById("cuisineInput"),
  priceInput: document.getElementById("priceInput"),
  signatureInput: document.getElementById("signatureInput"),
  menuInput: document.getElementById("menuInput"),
  fileHint: document.getElementById("fileHint"),
  shareListBtn: document.getElementById("shareListBtn"),
  shareResult: document.getElementById("shareResult"),
  restaurantList: document.getElementById("restaurantList"),
  shareCodeForm: document.getElementById("shareCodeForm"),
  shareCodeInput: document.getElementById("shareCodeInput"),
  collectionList: document.getElementById("collectionList"),
  addRestaurantModal: document.getElementById("addRestaurantModal"),
  addRestaurantModalBackdrop: document.getElementById("addRestaurantModalBackdrop"),
  modalListSelect: document.getElementById("modalListSelect"),
  modalNewListInput: document.getElementById("modalNewListInput"),
  confirmAddRestaurantBtn: document.getElementById("confirmAddRestaurantBtn"),
  cancelAddRestaurantBtn: document.getElementById("cancelAddRestaurantBtn"),
  collectionDetailModal: document.getElementById("collectionDetailModal"),
  collectionDetailModalBackdrop: document.getElementById("collectionDetailModalBackdrop"),
  collectionDetailTitle: document.getElementById("collectionDetailTitle"),
  collectionDetailBody: document.getElementById("collectionDetailBody"),
  closeCollectionDetailBtn: document.getElementById("closeCollectionDetailBtn"),
  restaurantListDetailModal: document.getElementById("restaurantListDetailModal"),
  restaurantListDetailModalBackdrop: document.getElementById("restaurantListDetailModalBackdrop"),
  restaurantListDetailTitle: document.getElementById("restaurantListDetailTitle"),
  restaurantListDetailBody: document.getElementById("restaurantListDetailBody"),
  closeRestaurantListDetailBtn: document.getElementById("closeRestaurantListDetailBtn"),
  adminPage: document.getElementById("adminPage"),
  adminPinForm: document.getElementById("adminPinForm"),
  adminPinInput: document.getElementById("adminPinInput"),
  adminPinBtn: document.getElementById("adminPinBtn"),
  adminMessage: document.getElementById("adminMessage"),
  adminUsers: document.getElementById("adminUsers"),
};

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id || !parsed.username) return null;
    return { id: String(parsed.id), username: String(parsed.username) };
  } catch {
    return null;
  }
}

function saveSession(user) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, username: user.username }));
}

function setBusy(busy) {
  state.busy = busy;
  [
    els.loginBtn,
    els.registerBtn,
    els.logoutBtn,
    els.spinBtn,
    els.submitBtn,
    els.shareListBtn,
    els.confirmAddRestaurantBtn,
    els.restaurantListDetailTitle,
    els.adminPinBtn,
  ].forEach((btn) => {
    if (btn) btn.disabled = busy;
  });
}

function setAuthMessage(message, type = "") {
  els.authMessage.textContent = message || "";
  els.authMessage.dataset.type = type;
}

function requireDb() {
  if (db) return true;
  setAuthMessage("请先配置 Supabase，并执行最新 supabase-schema.sql。", "error");
  return false;
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function isAdminUser() {
  return normalizeUsername(state.currentUser?.username) === ADMIN_USERNAME;
}

function validateUsername(username) {
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]{2,24}$/.test(username)) {
    return "用户名需为 2-24 位中文、字母、数字、_ 或 -。";
  }
  return "";
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const name = String(attachment.name || "").trim();
  if (!name) return null;
  return {
    name,
    type: String(attachment.type || "application/octet-stream"),
    size: Number(attachment.size) || 0,
  };
}

function normalizeList(row) {
  return {
    id: String(row.id),
    name: String(row.name || "").trim() || "未命名列表",
    createdAt: String(row.created_at || ""),
  };
}

function normalizeRestaurant(row) {
  return {
    id: String(row.id),
    listId: row.list_id ? String(row.list_id) : "",
    name: String(row.name || "").trim(),
    food: String(row.food || "").trim(),
    cuisine: String(row.cuisine || "").trim(),
    price: Number(row.price) > 0 ? Number(row.price) : "",
    signature: String(row.signature || "").trim(),
    attachment: normalizeAttachment(row.attachment),
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
  };
}

function normalizeSharedRestaurant(item) {
  return {
    id: String(item.id || `${Date.now()}-${Math.random()}`),
    name: String(item.name || "").trim(),
    food: String(item.food || "").trim(),
    cuisine: String(item.cuisine || "").trim(),
    price: Number(item.price) > 0 ? Number(item.price) : "",
    signature: String(item.signature || "").trim(),
    attachment: normalizeAttachment(item.attachment),
    createdAt: String(item.createdAt || item.created_at || new Date().toISOString()),
  };
}

function activeList() {
  return state.lists.find((list) => list.id === state.activeListId) || state.lists[0] || null;
}

function selectedList() {
  return state.lists.find((list) => list.id === state.selectedListId) || activeList();
}

function currentList() {
  const list = activeList();
  if (!list) return [];
  return state.restaurants.filter((item) => item.listId === list.id);
}

function shareTargetList() {
  return state.lists.find((list) => list.id === activeRestaurantListDetailId) || activeList();
}

function toRestaurantPayload(value) {
  const list = activeList();
  return {
    user_id: state.currentUser.id,
    list_id: list.id,
    org: "daily",
    name: value.name,
    food: value.food || "",
    cuisine: value.cuisine || "",
    price: value.price === "" ? null : Number(value.price),
    signature: value.signature || "",
    attachment: value.attachment,
  };
}

async function handleRegister() {
  if (!requireDb()) return;
  const username = normalizeUsername(els.usernameInput.value);
  const errorText = validateUsername(username);
  if (errorText) {
    setAuthMessage(errorText, "error");
    return;
  }

  setBusy(true);
  setAuthMessage("正在注册...");
  try {
    const { data: existing, error: findError } = await db
      .from("eat_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (findError) throw findError;
    if (existing) {
      setAuthMessage("用户名已存在，请重新注册。", "error");
      return;
    }

    const { data, error } = await db
      .from("eat_users")
      .insert({ username })
      .select("id, username")
      .single();
    if (error) {
      if (error.code === "23505") {
        setAuthMessage("用户名已存在，请重新注册。", "error");
        return;
      }
      throw error;
    }

    await enterSession(data, "注册成功，已登录。");
  } catch (error) {
    setAuthMessage(`注册失败：${error.message || error}`, "error");
  } finally {
    setBusy(false);
  }
}

async function handleLogin() {
  if (!requireDb()) return;
  const username = normalizeUsername(els.usernameInput.value);
  const errorText = validateUsername(username);
  if (errorText) {
    setAuthMessage(errorText, "error");
    return;
  }

  setBusy(true);
  setAuthMessage("正在登录...");
  try {
    const { data, error } = await db
      .from("eat_users")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      setAuthMessage("该用户名还未注册，请先注册。", "error");
      return;
    }

    await enterSession(data, "登录成功。");
  } catch (error) {
    setAuthMessage(`登录失败：${error.message || error}`, "error");
  } finally {
    setBusy(false);
  }
}

async function enterSession(user, message) {
  state.currentUser = { id: user.id, username: user.username };
  saveSession(state.currentUser);
  setAuthMessage(message, "success");
  await loadRemoteData();
  render();
}

function logout() {
  state.currentUser = null;
  state.lists = [];
  state.restaurants = [];
  state.collections = [];
  state.adminUsers = [];
  state.adminPinVerified = false;
  state.selectedListId = "";
  state.activeListId = "";
  state.activePage = 0;
  editingId = "";
  pendingAttachment = null;
  saveSession(null);
  if (els.adminPinForm) els.adminPinForm.reset();
  els.form.reset();
  renderResult(null);
  render();
  setAuthMessage("已退出，可切换其他用户名登录。");
}

async function loadRemoteData() {
  if (!state.currentUser || !db) return;
  setBusy(true);
  try {
    await ensureDefaultLists();
    await Promise.all([loadListsAndRestaurants(), loadCollections()]);
  } catch (error) {
    alert(`加载在线数据失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function ensureDefaultLists() {
  const { data, error } = await db
    .from("eat_lists")
    .select("id, name")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const lists = data || [];
  const oldCompany = lists.find((list) => list.name === "公司午餐");
  const hasNearby = lists.some((list) => list.name === "公司附近");
  if (oldCompany && !hasNearby) {
    const { error: renameError } = await db
      .from("eat_lists")
      .update({ name: "公司附近", updated_at: new Date().toISOString() })
      .eq("id", oldCompany.id)
      .eq("user_id", state.currentUser.id);
    if (renameError) throw renameError;
  }
  if (lists.length > 0) return;
  const { error: insertError } = await db.from("eat_lists").insert(
    DEFAULT_LIST_NAMES.map((name) => ({
      user_id: state.currentUser.id,
      name,
    }))
  );
  if (insertError) throw insertError;
}

async function migrateLegacyRestaurants(lists) {
  const company = lists.find((list) => list.name === "公司附近") || lists.find((list) => list.name === "公司午餐") || lists[0];
  const team = lists.find((list) => list.name === "团建聚餐") || lists[1] || company;
  if (!company || !team) return;
  await Promise.all([
    db
      .from("eat_restaurants")
      .update({ list_id: company.id })
      .eq("user_id", state.currentUser.id)
      .is("list_id", null)
      .eq("org", "daily"),
    db
      .from("eat_restaurants")
      .update({ list_id: team.id })
      .eq("user_id", state.currentUser.id)
      .is("list_id", null)
      .eq("org", "team"),
  ]);
}

async function loadListsAndRestaurants() {
  const { data: listRows, error: listError } = await db
    .from("eat_lists")
    .select("*")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: true });
  if (listError) throw listError;

  state.lists = (listRows || []).map(normalizeList);
  await migrateLegacyRestaurants(state.lists);

  const { data, error } = await db
    .from("eat_restaurants")
    .select("*")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  state.restaurants = (data || []).map(normalizeRestaurant).filter((item) => item.listId);
  const storedId = localStorage.getItem(ACTIVE_LIST_KEY);
  const fallbackId = state.lists[0]?.id || "";
  state.activeListId = state.lists.some((list) => list.id === state.activeListId)
    ? state.activeListId
    : state.lists.some((list) => list.id === storedId)
      ? storedId
      : fallbackId;
  state.selectedListId = state.lists.some((list) => list.id === state.selectedListId)
    ? state.selectedListId
    : state.activeListId;
  if (state.activeListId) localStorage.setItem(ACTIVE_LIST_KEY, state.activeListId);
}

async function loadCollections() {
  const { data: rows, error } = await db
    .from("eat_collections")
    .select("id, share_list_id, share_code, created_at")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = [...new Set((rows || []).map((row) => row.share_list_id).filter(Boolean))];
  if (ids.length === 0) {
    state.collections = [];
    return;
  }

  const { data: shares, error: shareError } = await db
    .from("eat_share_lists")
    .select("*")
    .in("id", ids);
  if (shareError) throw shareError;

  const shareById = new Map((shares || []).map((share) => [share.id, share]));
  state.collections = (rows || [])
    .map((row) => {
      const share = shareById.get(row.share_list_id);
      if (!share) return null;
      return normalizeCollection(row, share);
    })
    .filter(Boolean);
}

function normalizeCollection(row, share) {
  const restaurants = Array.isArray(share.restaurants)
    ? share.restaurants.map(normalizeSharedRestaurant).filter((item) => item.name)
    : [];
  const first = Array.isArray(share.restaurants) ? share.restaurants[0] : null;
  return {
    id: String(row.id),
    shareListId: String(share.id),
    shareCode: String(share.share_code),
    ownerUsername: String(share.owner_username || ""),
    listName: String(share.list_name || first?.sourceListName || "分享列表"),
    restaurants,
    createdAt: String(row.created_at || share.created_at || ""),
  };
}

function visiblePageCount() {
  return isAdminUser() ? 3 : 2;
}

function setActivePage(page) {
  const maxPage = visiblePageCount() - 1;
  const nextPage = Math.max(0, Math.min(maxPage, Number(page) || 0));
  state.activePage = nextPage;
  if (els.pageTrack) {
    els.pageTrack.style.transform = `translateX(-${state.activePage * 100}%)`;
  }
  els.pageDots?.querySelectorAll(".page-dot").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.page) === state.activePage);
  });
}

function applySelectedList() {
  const nextId = String(state.selectedListId || "");
  if (!state.lists.some((list) => list.id === nextId)) return;
  state.selectedListId = nextId;
  state.activeListId = nextId;
  localStorage.setItem(ACTIVE_LIST_KEY, nextId);
  editingId = "";
  pendingAttachment = null;
  els.form.reset();
  renderResult(null);
  hideShareCode();
  render();
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

function readableTextAngle(angle) {
  const normalized = normalizeDeg(angle);
  const signed = normalized > 180 ? normalized - 360 : normalized;
  return Math.max(-32, Math.min(32, signed));
}

function buildWheelSegments(items) {
  if (items.length === 0) {
    els.wheel.innerHTML = '<div class="wheel-empty">先新增餐厅</div>';
    els.wheel.style.background = "";
    els.wheel.style.transform = "";
    return;
  }

  const colors = ["#ffa62b", "#ffcb77", "#6ec6a4", "#ff6b6b", "#7ec8e3", "#ff8f1f"];
  const step = 360 / items.length;
  const gradient = items
    .map((_, index) => `${colors[index % colors.length]} ${index * step}deg ${(index + 1) * step}deg`)
    .join(", ");

  els.wheel.style.background = `conic-gradient(from ${wheelRotationDeg}deg, ${gradient})`;
  els.wheel.innerHTML = "";
  els.wheel.style.transform = "";

  items.slice(0, 10).forEach((item, index) => {
    const angle = normalizeDeg(index * step + step / 2 + wheelRotationDeg);
    const labelRadiusPct = items.length === 1 ? 28 : 33;
    const x = 50 + Math.sin((angle * Math.PI) / 180) * labelRadiusPct;
    const y = 50 - Math.cos((angle * Math.PI) / 180) * labelRadiusPct;
    const segment = document.createElement("div");
    segment.className = "wheel-label";
    segment.style.left = `${x}%`;
    segment.style.top = `${y}%`;
    segment.style.setProperty("--label-angle", `${readableTextAngle(angle)}deg`);
    segment.innerHTML = `<span>${escapeHtml(item.name)}${item.food ? `<small>${escapeHtml(item.food)}</small>` : ""}</span>`;
    els.wheel.appendChild(segment);
  });
}

function renderResult(item) {
  if (!els.resultCard || !els.resultName || !els.resultFood) return;
  if (!item) {
    els.resultCard.classList.add("hidden");
    return;
  }
  els.resultName.textContent = item.name;
  els.resultFood.textContent = item.food || "未填写推荐食物";
  els.resultFood.classList.toggle("is-empty", !item.food);
  els.resultCard.classList.remove("hidden");
}

function spinWheel() {
  const items = currentList();
  if (items.length === 0) {
    alert("请先在当前列表下新增餐厅。");
    return;
  }

  els.spinBtn.disabled = true;
  els.spinBtn.textContent = "抽取中...";
  const winnerIndex = Math.floor(Math.random() * items.length);
  const rounds = 4 + Math.floor(Math.random() * 3);
  const targetDeg = rounds * 360 + (360 / items.length) * winnerIndex + 18;
  els.wheel.style.transform = `rotate(${targetDeg}deg)`;

  window.setTimeout(() => {
    wheelRotationDeg = normalizeDeg(targetDeg);
    buildWheelSegments(items);
    els.spinBtn.disabled = false;
    els.spinBtn.textContent = "再抽一次！";
    renderResult(items[winnerIndex]);
  }, 900);
}

function formatPrice(price) {
  return Number(price) > 0 ? `¥${Number(price)}/人` : "未填人均";
}

function renderAuth() {
  const loggedIn = Boolean(state.currentUser);
  const admin = isAdminUser();
  els.authCard.classList.toggle("hidden", loggedIn);
  els.sessionCard.classList.toggle("hidden", !loggedIn);
  els.mainContent.classList.toggle("hidden", !loggedIn);
  els.currentUsername.textContent = loggedIn ? state.currentUser.username : "未登录";
  els.adminPage?.classList.toggle("hidden", !admin);
  els.pageDots?.querySelector(".admin-dot")?.classList.toggle("hidden", !admin);
  if (!admin) {
    state.adminPinVerified = false;
    state.adminUsers = [];
    if (state.activePage > 1) state.activePage = 0;
  }
  if (!supabaseReady && !loggedIn) {
    setAuthMessage("请先配置 Supabase 后再注册登录。", "error");
  }
}

function setAdminMessage(message, type = "") {
  if (!els.adminMessage) return;
  els.adminMessage.textContent = message || "";
  els.adminMessage.dataset.type = type;
}

function renderAdminUsers() {
  if (!els.adminUsers) return;
  if (!isAdminUser()) {
    els.adminUsers.classList.add("hidden");
    els.adminUsers.innerHTML = "";
    return;
  }
  if (!state.adminPinVerified) {
    els.adminUsers.classList.add("hidden");
    els.adminUsers.innerHTML = "";
    return;
  }
  els.adminUsers.classList.remove("hidden");
  if (state.adminUsers.length === 0) {
    els.adminUsers.innerHTML = '<div class="empty-list">暂无用户。</div>';
    return;
  }
  els.adminUsers.innerHTML = `
    <div class="admin-users-head">
      <strong>全部用户</strong>
      <span>${state.adminUsers.length} 人</span>
    </div>
    <div class="admin-user-list">
      ${state.adminUsers
        .map(
          (user) => `
            <article class="admin-user-card">
              <strong>${escapeHtml(user.username)}</strong>
              <small>${escapeHtml(formatDateTime(user.createdAt))}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function formatDateTime(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function loadAdminUsers() {
  if (!isAdminUser() || !requireDb()) return;
  setBusy(true);
  setAdminMessage("正在加载用户...");
  try {
    const { data, error } = await db.from("eat_users").select("id, username, created_at").order("created_at", { ascending: false });
    if (error) throw error;
    state.adminUsers = (data || []).map((user) => ({
      id: String(user.id),
      username: String(user.username || ""),
      createdAt: String(user.created_at || ""),
    }));
    setAdminMessage(`已加载 ${state.adminUsers.length} 个用户。`, "success");
    renderAdminUsers();
  } catch (error) {
    setAdminMessage(`加载失败：${error.message || error}`, "error");
  } finally {
    setBusy(false);
  }
}

async function handleAdminPinSubmit(event) {
  event.preventDefault();
  if (!isAdminUser()) {
    setAdminMessage("当前账号不是管理员。", "error");
    return;
  }
  const pin = String(els.adminPinInput?.value || "").trim();
  if (pin !== ADMIN_PIN) {
    state.adminPinVerified = false;
    state.adminUsers = [];
    setAdminMessage("PIN 码不正确。", "error");
    renderAdminUsers();
    return;
  }
  state.adminPinVerified = true;
  await loadAdminUsers();
}

function renderListControls() {
  const selected = selectedList();
  els.listSelectLabel.textContent = selected ? selected.name : "选择列表";
  els.listSelectMenu.innerHTML = "";
  state.lists.forEach((list) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "custom-select-option";
    option.dataset.listId = list.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", list.id === state.selectedListId ? "true" : "false");
    option.textContent = list.name;
    els.listSelectMenu.appendChild(option);
  });
}

function renderModalListOptions() {
  els.modalListSelect.innerHTML = "";
  state.lists.forEach((list) => {
    const opt = document.createElement("option");
    opt.value = list.id;
    opt.textContent = list.name;
    opt.selected = list.id === state.activeListId;
    els.modalListSelect.appendChild(opt);
  });
}

function setAddRestaurantModalOpen(open, mode = "add") {
  els.addRestaurantModal.classList.toggle("hidden", !open);
  if (open) {
    renderModalListOptions();
    els.modalNewListInput.value = "";
    document.getElementById("addRestaurantModalTitle").textContent =
      mode === "import" ? "加入列表" : "添加到列表";
    document.getElementById("addRestaurantModalDesc").textContent =
      mode === "import"
        ? "填写新列表名称时，会先创建该列表，再把勾选餐厅加入进去。"
        : "填写新列表名称时，会先创建该列表，再把餐厅添加进去。";
    els.confirmAddRestaurantBtn.textContent = mode === "import" ? "确定加入" : "确定添加";
    els.modalListSelect.focus();
  } else {
    pendingAddValue = null;
    pendingImportCollectionId = "";
  }
}

function renderList() {
  els.restaurantList.innerHTML = "";

  if (state.lists.length === 0) {
    els.restaurantList.innerHTML = '<div class="empty-list">还没有餐厅列表，右滑新增餐厅时可以创建列表。</div>';
    return;
  }

  state.lists
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .forEach((list) => {
      const count = state.restaurants.filter((item) => item.listId === list.id).length;
      const wrap = document.createElement("div");
      wrap.className = "collection-swipe restaurant-list-swipe";
      wrap.dataset.listId = list.id;
      wrap.innerHTML = `
        <button type="button" class="collection-delete-action" data-action="delete-list" data-id="${list.id}">删除</button>
        <article class="collection-card restaurant-list-card">
          <button type="button" class="collection-open" data-action="open-restaurant-list-detail" data-id="${list.id}">
            <span>
              <strong>${escapeHtml(list.name)}</strong>
              <small>${count} 家餐厅${list.id === state.activeListId ? " · 当前转盘列表" : ""}</small>
            </span>
          </button>
        </article>
      `;
      els.restaurantList.appendChild(wrap);
    });
}

function setRestaurantListDetailModalOpen(open, listId = "") {
  if (!els.restaurantListDetailModal) return;
  activeRestaurantListDetailId = open ? listId : "";
  els.restaurantListDetailModal.classList.toggle("hidden", !open);
  if (!open || visibleShareListId !== listId) hideShareCode();
  if (open) renderRestaurantListDetail(listId);
  updateShareButtonText();
}

function renderRestaurantListDetail(listId) {
  const list = state.lists.find((item) => item.id === listId);
  if (!list) return;
  const items = state.restaurants
    .filter((item) => item.listId === list.id)
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  els.restaurantListDetailTitle.value = list.name;
  els.restaurantListDetailBody.innerHTML = items.length
    ? `
      <p class="panel-desc">${items.length} 家餐厅${list.id === state.activeListId ? " · 当前转盘列表" : ""}</p>
      <div class="restaurant-detail-items">
        ${items.map(renderRestaurantDetailCard).join("")}
      </div>
    `
    : '<div class="empty-list">这个列表还没有餐厅，右滑去新增一个吧。</div>';
}

async function saveRestaurantListName() {
  const list = state.lists.find((item) => item.id === activeRestaurantListDetailId);
  if (!list || !state.currentUser || !requireDb()) return;
  const nextName = String(els.restaurantListDetailTitle.value || "").trim();
  if (!nextName) {
    els.restaurantListDetailTitle.value = list.name;
    alert("列表名称不能为空。");
    return;
  }
  if (nextName === list.name) return;

  setBusy(true);
  try {
    const { error } = await db
      .from("eat_lists")
      .update({ name: nextName, updated_at: new Date().toISOString() })
      .eq("id", list.id)
      .eq("user_id", state.currentUser.id);
    if (error) throw error;
    list.name = nextName;
    renderListControls();
    renderList();
    renderRestaurantListDetail(list.id);
  } catch (error) {
    els.restaurantListDetailTitle.value = list.name;
    alert(`修改列表名称失败：${error.message || error}`);
  } finally {
    setBusy(false);
    updateShareButtonText();
  }
}

function renderRestaurantDetailCard(item) {
  const attachmentText = item.attachment
    ? `<span class="attachment-link">菜单附件：${escapeHtml(item.attachment.name)}</span>`
    : "";
  return `
    <article class="restaurant-card">
      <div class="restaurant-main">
        <div class="restaurant-icon">${escapeHtml(item.name.slice(0, 1))}</div>
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${item.food ? escapeHtml(item.food) : "未填写推荐食物"}</p>
        </div>
      </div>
      <div class="restaurant-tags">
        <span>${escapeHtml(item.cuisine || "未填菜系")}</span>
        <span>${formatPrice(item.price)}</span>
      </div>
      ${item.signature ? `<p class="signature">招牌：${escapeHtml(item.signature)}</p>` : ""}
      ${attachmentText}
      <div class="card-actions">
        <button type="button" class="secondary-action" data-action="edit" data-id="${item.id}">编辑</button>
        <button type="button" class="danger-action" data-action="delete" data-id="${item.id}">删除</button>
      </div>
    </article>
  `;
}

function renderCollections() {
  els.collectionList.innerHTML = "";
  if (state.collections.length === 0) {
    els.collectionList.innerHTML = '<div class="empty-list">暂无收藏的 list。输入分享码后会折叠保存在这里。</div>';
    return;
  }

  state.collections.forEach((collection) => {
    const wrap = document.createElement("div");
    wrap.className = "collection-swipe";
    wrap.dataset.collectionId = collection.id;
    wrap.innerHTML = `
      <button type="button" class="collection-delete-action" data-action="delete-collection" data-id="${collection.id}">删除</button>
      <article class="collection-card">
        <button type="button" class="collection-open" data-action="open-collection-detail" data-id="${collection.id}">
          <span>
            <strong>${escapeHtml(collection.ownerUsername)} 的 ${escapeHtml(collection.listName)}</strong>
            <small>${escapeHtml(collection.shareCode)} · ${collection.restaurants.length} 家餐厅</small>
          </span>
        </button>
      </article>
    `;
    els.collectionList.appendChild(wrap);
  });
}

function setCollectionDetailModalOpen(open, collectionId = "") {
  if (!els.collectionDetailModal) return;
  activeCollectionDetailId = open ? collectionId : "";
  els.collectionDetailModal.classList.toggle("hidden", !open);
  if (open) renderCollectionDetail(collectionId);
}

function renderCollectionDetail(collectionId) {
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection) return;
  els.collectionDetailTitle.textContent = `${collection.ownerUsername} 的 ${collection.listName}`;
  els.collectionDetailBody.innerHTML = `
    <p class="panel-desc">${escapeHtml(collection.shareCode)} · ${collection.restaurants.length} 家餐厅</p>
    <div class="collection-items collection-items--modal">
      ${collection.restaurants
        .map(
          (item, index) => `
            <label class="collection-item">
              <input type="checkbox" data-collection-id="${collection.id}" data-index="${index}" />
              <span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.food || "未填写推荐食物")} · ${escapeHtml(item.cuisine || "未填菜系")} · ${formatPrice(item.price)}</small>
              </span>
            </label>
          `
        )
        .join("")}
    </div>
    <button type="button" class="primary-action collection-import-action" data-action="import-collection" data-id="${collection.id}">加入列表</button>
  `;
}

function render() {
  const list = activeList();
  const items = currentList();
  renderAuth();
  renderListControls();
  els.restaurantCount.textContent = `${items.length} 家餐厅`;
  updateShareButtonText();
  els.submitBtn.textContent = editingId ? "保存修改" : "添加";
  buildWheelSegments(items);
  renderList();
  renderCollections();
  renderAdminUsers();
  updateFileHint();
  setActivePage(state.activePage);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

function collectFormValue() {
  const name = els.nameInput.value.trim();
  const food = els.foodInput.value.trim();
  if (!name) {
    alert("请填写餐厅名称。");
    return null;
  }
  return {
    name,
    food,
    cuisine: els.cuisineInput.value.trim(),
    price: els.priceInput.value ? Math.max(0, Number(els.priceInput.value)) : "",
    signature: els.signatureInput.value.trim(),
    attachment: pendingAttachment,
  };
}

function resetForm() {
  editingId = "";
  pendingAttachment = null;
  els.form.reset();
  render();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.currentUser || !requireDb()) return;
  const value = collectFormValue();
  if (!value) return;

  if (!editingId) {
    pendingAddValue = value;
    setAddRestaurantModalOpen(true);
    return;
  }

  setBusy(true);
  try {
    const { error } = await db
      .from("eat_restaurants")
      .update(toRestaurantPayload(value))
      .eq("id", editingId)
      .eq("user_id", state.currentUser.id);
    if (error) throw error;
    await loadListsAndRestaurants();
    resetForm();
    setActivePage(0);
  } catch (error) {
    alert(`保存失败：${error.message || error}`);
  } finally {
    setBusy(false);
    render();
  }
}

function editRestaurant(id) {
  const item = state.restaurants.find((x) => x.id === id);
  if (!item) return;
  state.activeListId = item.listId;
  state.selectedListId = item.listId;
  localStorage.setItem(ACTIVE_LIST_KEY, item.listId);
  editingId = id;
  pendingAttachment = item.attachment;
  els.nameInput.value = item.name;
  els.foodInput.value = item.food;
  els.cuisineInput.value = item.cuisine || "";
  els.priceInput.value = item.price || "";
  els.signatureInput.value = item.signature || "";
  els.menuInput.value = "";
  setRestaurantListDetailModalOpen(false);
  render();
  setActivePage(1);
  els.nameInput.focus();
}

async function deleteRestaurant(id) {
  const item = state.restaurants.find((x) => x.id === id);
  if (!item) return;
  if (!confirm(`确定删除「${item.name}」吗？`)) return;
  setBusy(true);
  try {
    const { error } = await db
      .from("eat_restaurants")
      .delete()
      .eq("id", id)
      .eq("user_id", state.currentUser.id);
    if (error) throw error;
    if (editingId === id) editingId = "";
    await loadListsAndRestaurants();
    resetForm();
  } catch (error) {
    alert(`删除失败：${error.message || error}`);
  } finally {
    setBusy(false);
    render();
    if (activeRestaurantListDetailId) renderRestaurantListDetail(activeRestaurantListDetailId);
  }
}

async function deleteRestaurantList(listId) {
  const list = state.lists.find((item) => item.id === listId);
  if (!list || !state.currentUser || !requireDb()) return;
  const count = state.restaurants.filter((item) => item.listId === list.id).length;
  if (!confirm(`删除列表「${list.name}」？其中 ${count} 家餐厅也会一起删除。`)) return;

  setBusy(true);
  try {
    const { error: restaurantError } = await db
      .from("eat_restaurants")
      .delete()
      .eq("user_id", state.currentUser.id)
      .eq("list_id", list.id);
    if (restaurantError) throw restaurantError;

    const { error: listError } = await db.from("eat_lists").delete().eq("id", list.id).eq("user_id", state.currentUser.id);
    if (listError) throw listError;

    if (editingId && state.restaurants.some((item) => item.id === editingId && item.listId === list.id)) {
      resetForm();
    }
    if (activeRestaurantListDetailId === list.id) setRestaurantListDetailModalOpen(false);
    await deleteOwnedSharesForList(list.id);
    await loadListsAndRestaurants();
    const fallbackId = state.lists.find((item) => item.id !== list.id)?.id || state.lists[0]?.id || "";
    state.activeListId = fallbackId;
    state.selectedListId = fallbackId;
    if (fallbackId) {
      localStorage.setItem(ACTIVE_LIST_KEY, fallbackId);
    } else {
      localStorage.removeItem(ACTIVE_LIST_KEY);
    }
    render();
  } catch (error) {
    alert(`删除列表失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function deleteOwnedSharesForList(listId) {
  const { data, error } = await db
    .from("eat_share_lists")
    .select("id, restaurants")
    .eq("owner_user_id", state.currentUser.id);
  if (error) throw error;
  const ids = (data || [])
    .filter((share) => {
      const first = Array.isArray(share.restaurants) ? share.restaurants[0] : null;
      return first?.sourceListId === listId;
    })
    .map((share) => share.id);
  if (ids.length === 0) return;
  const { error: deleteError } = await db.from("eat_share_lists").delete().in("id", ids);
  if (deleteError) throw deleteError;
}

async function confirmAddRestaurant() {
  if (pendingImportCollectionId) {
    await importCollectionToChosenList();
    return;
  }
  if (!pendingAddValue || !state.currentUser || !requireDb()) return;
  const newListName = String(els.modalNewListInput.value || "").trim();
  let targetListId = String(els.modalListSelect.value || "");

  setBusy(true);
  try {
    if (newListName) {
      targetListId = await createListFromModal(newListName);
    } else if (!state.lists.some((list) => list.id === targetListId)) {
      alert("请选择一个列表，或输入新列表名称。");
      return;
    }

    const { error } = await db.from("eat_restaurants").insert({
      user_id: state.currentUser.id,
      list_id: targetListId,
      org: "daily",
      name: pendingAddValue.name,
      food: pendingAddValue.food || "",
      cuisine: pendingAddValue.cuisine || "",
      price: pendingAddValue.price === "" ? null : Number(pendingAddValue.price),
      signature: pendingAddValue.signature || "",
      attachment: pendingAddValue.attachment,
    });
    if (error) throw error;

    pendingAddValue = null;
    setAddRestaurantModalOpen(false);
    await loadListsAndRestaurants();
    resetForm();
    setActivePage(0);
  } catch (error) {
    alert(`添加失败：${error.message || error}`);
  } finally {
    setBusy(false);
    render();
  }
}

async function createListFromModal(name) {
  const { data, error } = await db
    .from("eat_lists")
    .insert({ user_id: state.currentUser.id, name })
    .select("*")
    .single();
  if (error) throw error;
  const list = normalizeList(data);
  state.lists.push(list);
  state.selectedListId = list.id;
  state.activeListId = list.id;
  localStorage.setItem(ACTIVE_LIST_KEY, list.id);
  return list.id;
}

function readAttachment(file) {
  if (!file) {
    pendingAttachment = null;
    updateFileHint();
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    alert("菜单附件不能超过 2.5MB。");
    els.menuInput.value = "";
    return;
  }
  pendingAttachment = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
  updateFileHint();
}

function updateFileHint() {
  if (!pendingAttachment) {
    els.fileHint.textContent = "";
    return;
  }
  const kb = Math.max(1, Math.round(pendingAttachment.size / 1024));
  els.fileHint.textContent = `已选择：${pendingAttachment.name}（${kb}KB）`;
}

function randomShareSuffix() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function createShareCode(listId = "") {
  if (!state.currentUser || !requireDb()) return;
  const list = state.lists.find((item) => item.id === listId) || shareTargetList();
  const items = list ? state.restaurants.filter((item) => item.listId === list.id) : [];
  if (!list) {
    alert("请先创建并应用一个列表。");
    return;
  }
  if (items.length === 0) {
    alert("当前列表还没有餐厅，无法生成分享码。");
    return;
  }

  setBusy(true);
  try {
    const existing = await findExistingShareForList(list.id);
    if (existing) {
      const snapshot = makeShareSnapshot(list, items);
      const { error: updateError } = await db
        .from("eat_share_lists")
        .update({ restaurants: snapshot })
        .eq("share_code", existing.share_code)
        .eq("owner_user_id", state.currentUser.id);
      if (updateError) throw updateError;
      renderShareCode(existing.share_code, list.id);
      return;
    }

    let saved = null;
    for (let i = 0; i < 5 && !saved; i += 1) {
      const shareCode = `${state.currentUser.username}${randomShareSuffix()}`;
      const snapshot = makeShareSnapshot(list, items);
      const { data, error } = await db
        .from("eat_share_lists")
        .insert({
          share_code: shareCode,
          owner_user_id: state.currentUser.id,
          owner_username: state.currentUser.username,
          org: "daily",
          restaurants: snapshot,
        })
        .select("share_code")
        .single();
      if (error && error.code === "23505") continue;
      if (error) throw error;
      saved = data;
    }
    if (!saved) throw new Error("分享码生成冲突，请重试。");
    renderShareCode(saved.share_code, list.id);
  } catch (error) {
    alert(`生成分享码失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

function makeShareSnapshot(list, items) {
  return items.map(({ id, name, food, cuisine, price, signature, attachment, createdAt }) => ({
    id,
    name,
    food,
    cuisine,
    price,
    signature,
    attachment,
    createdAt,
    sourceListId: list.id,
    sourceListName: list.name,
  }));
}

async function findExistingShareForList(listId) {
  const { data, error } = await db
    .from("eat_share_lists")
    .select("share_code, restaurants, created_at")
    .eq("owner_user_id", state.currentUser.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).find((share) => {
    const first = Array.isArray(share.restaurants) ? share.restaurants[0] : null;
    return first?.sourceListId === listId;
  });
}

function renderShareCode(code, listId) {
  visibleShareListId = listId || "";
  els.shareResult.classList.remove("hidden");
  els.shareResult.innerHTML = `
    <span>list 分享码</span>
    <strong>${escapeHtml(code)}</strong>
    <button type="button" class="secondary-action" data-action="copy-share-code" data-code="${escapeHtml(code)}">复制</button>
  `;
  updateShareButtonText();
}

function hideShareCode() {
  visibleShareListId = "";
  els.shareResult.classList.add("hidden");
}

function updateShareButtonText() {
  if (!els.shareListBtn) return;
  const list = shareTargetList();
  els.shareListBtn.textContent =
    list && visibleShareListId === list.id && !els.shareResult.classList.contains("hidden") ? "收起" : "分享列表";
}

async function copyShareCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    alert("分享码已复制。");
  } catch {
    prompt("复制分享码：", code);
  }
}

async function openShareCode(event) {
  event.preventDefault();
  if (!state.currentUser || !requireDb()) return;
  const shareCode = String(els.shareCodeInput.value || "").trim();
  if (!shareCode) {
    alert("请输入 list 分享码。");
    return;
  }

  setBusy(true);
  try {
    const { data: share, error } = await db
      .from("eat_share_lists")
      .select("*")
      .eq("share_code", shareCode)
      .maybeSingle();
    if (error) throw error;
    if (!share) {
      alert("未找到该分享码，请检查后重试。");
      return;
    }

    const { error: insertError } = await db
      .from("eat_collections")
      .upsert(
        {
          user_id: state.currentUser.id,
          share_list_id: share.id,
          share_code: share.share_code,
        },
        { onConflict: "user_id,share_list_id" }
      );
    if (insertError) throw insertError;

    els.shareCodeInput.value = "";
    await loadCollections();
    renderCollections();
  } catch (error) {
    alert(`打开分享码失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

function openImportCollectionModal(collectionId) {
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection) return;
  const checked = selectedCollectionInputs(collectionId);
  if (checked.length === 0) {
    alert("请先勾选要加入的餐厅。");
    return;
  }
  pendingImportCollectionId = collectionId;
  setAddRestaurantModalOpen(true, "import");
}

async function importCollectionToChosenList() {
  const collectionId = pendingImportCollectionId;
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection || !requireDb()) return;
  const checked = selectedCollectionInputs(collectionId);
  if (checked.length === 0) {
    alert("请先勾选要加入的餐厅。");
    return;
  }
  const newListName = String(els.modalNewListInput.value || "").trim();
  let targetListId = String(els.modalListSelect.value || "");

  const selected = checked
    .map((input) => collection.restaurants[Number(input.dataset.index)])
    .filter(Boolean)
    .map((item) => ({
      user_id: state.currentUser.id,
      list_id: targetListId,
      org: "daily",
      name: item.name,
      food: item.food || "",
      cuisine: item.cuisine || "",
      price: item.price === "" ? null : Number(item.price),
      signature: item.signature || "",
      attachment: item.attachment,
    }));

  setBusy(true);
  try {
    if (newListName) {
      targetListId = await createListFromModal(newListName);
      selected.forEach((item) => {
        item.list_id = targetListId;
      });
    } else if (!state.lists.some((list) => list.id === targetListId)) {
      alert("请选择一个列表，或输入新列表名称。");
      return;
    }
    const { error } = await db.from("eat_restaurants").insert(selected);
    if (error) throw error;
    const targetList = state.lists.find((list) => list.id === targetListId);
    pendingImportCollectionId = "";
    setAddRestaurantModalOpen(false);
    setCollectionDetailModalOpen(false);
    await loadListsAndRestaurants();
    render();
    alert(`已加入 ${selected.length} 家餐厅到「${targetList?.name || "目标列表"}」。`);
  } catch (error) {
    alert(`导入失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

function selectedCollectionInputs(collectionId) {
  return [
    ...els.collectionDetailBody.querySelectorAll(
      `input[type="checkbox"][data-collection-id="${CSS.escape(collectionId)}"]:checked`
    ),
  ];
}

async function deleteCollection(collectionId) {
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection) return;
  if (!confirm(`删除收藏「${collection.listName}」？已添加到自己列表的餐厅不会受影响。`)) return;
  setBusy(true);
  try {
    const { error } = await db
      .from("eat_collections")
      .delete()
      .eq("id", collectionId)
      .eq("user_id", state.currentUser.id);
    if (error) throw error;
    state.collections = state.collections.filter((item) => item.id !== collectionId);
    renderCollections();
  } catch (error) {
    alert(`删除收藏失败：${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

function bindEvents() {
  let touchStartX = 0;
  let touchStartY = 0;
  els.pageDots?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const dot = target.closest(".page-dot");
    if (!(dot instanceof HTMLElement)) return;
    setActivePage(Number(dot.dataset.page));
  });
  els.pageSlider?.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );
  els.pageSlider?.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      setActivePage(state.activePage + (dx < 0 ? 1 : -1));
    },
    { passive: true }
  );
  els.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleLogin();
  });
  els.adminPinForm?.addEventListener("submit", handleAdminPinSubmit);
  els.loginBtn.addEventListener("click", handleLogin);
  els.registerBtn.addEventListener("click", handleRegister);
  els.logoutBtn.addEventListener("click", logout);
  els.listSelectTrigger.addEventListener("click", () => {
    const opening = els.listSelectMenu.classList.contains("hidden");
    els.listSelectMenu.classList.toggle("hidden", !opening);
    els.listSelectTrigger.setAttribute("aria-expanded", opening ? "true" : "false");
  });
  els.listSelectMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const option = target.closest(".custom-select-option");
    if (!(option instanceof HTMLElement) || !option.dataset.listId) return;
    state.selectedListId = option.dataset.listId;
    els.listSelectMenu.classList.add("hidden");
    els.listSelectTrigger.setAttribute("aria-expanded", "false");
    applySelectedList();
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!els.listSelectWrap.contains(target)) {
      els.listSelectMenu.classList.add("hidden");
      els.listSelectTrigger.setAttribute("aria-expanded", "false");
    }
    if (!els.shareResult.classList.contains("hidden") && !els.shareResult.contains(target) && !els.shareListBtn.contains(target)) {
      hideShareCode();
      updateShareButtonText();
    }
  });
  els.spinBtn.addEventListener("click", spinWheel);
  els.closeResultBtn.addEventListener("click", () => renderResult(null));
  els.resultModalBackdrop.addEventListener("click", () => renderResult(null));
  els.form.addEventListener("submit", handleSubmit);
  els.menuInput.addEventListener("change", () => readAttachment(els.menuInput.files?.[0]));
  els.confirmAddRestaurantBtn.addEventListener("click", confirmAddRestaurant);
  els.cancelAddRestaurantBtn.addEventListener("click", () => setAddRestaurantModalOpen(false));
  els.addRestaurantModalBackdrop.addEventListener("click", () => setAddRestaurantModalOpen(false));
  els.closeCollectionDetailBtn.addEventListener("click", () => setCollectionDetailModalOpen(false));
  els.collectionDetailModalBackdrop.addEventListener("click", () => setCollectionDetailModalOpen(false));
  els.closeRestaurantListDetailBtn.addEventListener("click", () => setRestaurantListDetailModalOpen(false));
  els.restaurantListDetailModalBackdrop.addEventListener("click", () => setRestaurantListDetailModalOpen(false));
  els.restaurantListDetailTitle.addEventListener("blur", saveRestaurantListName);
  els.restaurantListDetailTitle.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.restaurantListDetailTitle.blur();
    }
    if (event.key === "Escape") {
      const list = state.lists.find((item) => item.id === activeRestaurantListDetailId);
      if (list) els.restaurantListDetailTitle.value = list.name;
      els.restaurantListDetailTitle.blur();
    }
  });
  els.shareListBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const list = shareTargetList();
    if (list && visibleShareListId === list.id && !els.shareResult.classList.contains("hidden")) {
      hideShareCode();
      updateShareButtonText();
      return;
    }
    createShareCode(list?.id || "");
  });
  els.shareCodeForm.addEventListener("submit", openShareCode);
  els.restaurantList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLElement)) return;
    const { action, id } = button.dataset;
    if (action === "delete-list" && id) {
      event.preventDefault();
      event.stopPropagation();
      deleteRestaurantList(id);
      return;
    }
    if (action === "open-restaurant-list-detail" && id) setRestaurantListDetailModalOpen(true, id);
    if (action === "edit") editRestaurant(id);
    if (action === "delete") deleteRestaurant(id);
  });
  els.restaurantListDetailBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLElement)) return;
    const { action, id } = button.dataset;
    if (action === "edit" && id) editRestaurant(id);
    if (action === "delete" && id) deleteRestaurant(id);
  });
  els.shareResult.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action='copy-share-code']");
    if (!(button instanceof HTMLElement) || !button.dataset.code) return;
    copyShareCode(button.dataset.code);
  });
  els.collectionList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteBtn = target.closest("button[data-action='delete-collection']");
    if (deleteBtn instanceof HTMLElement && deleteBtn.dataset.id) {
      event.preventDefault();
      event.stopPropagation();
      deleteCollection(deleteBtn.dataset.id);
      return;
    }
    const openBtn = target.closest("button[data-action='open-collection-detail']");
    if (openBtn instanceof HTMLElement && openBtn.dataset.id) {
      setCollectionDetailModalOpen(true, openBtn.dataset.id);
      return;
    }
  });
  els.collectionDetailBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action='import-collection']");
    if (!(button instanceof HTMLElement) || !button.dataset.id) return;
    openImportCollectionModal(button.dataset.id);
  });
}

async function init() {
  bindEvents();
  if (state.currentUser && !db) {
    state.currentUser = null;
    saveSession(null);
  }
  if (state.currentUser && db) {
    await loadRemoteData();
  }
  render();
}

init();
