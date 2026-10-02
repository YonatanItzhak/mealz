const STORAGE_KEY = "meal-tracker-v1";
const SLOTS = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
];

const els = {
  bank: document.getElementById("view-bank"),
  calendar: document.getElementById("view-calendar"),
  mealList: document.getElementById("meal-list"),
  addMeal: document.getElementById("add-meal"),
  mealDialog: document.getElementById("meal-dialog"),
  mealForm: document.getElementById("meal-form"),
  mealFormTitle: document.getElementById("meal-form-title"),
  mealName: document.getElementById("meal-name"),
  mealDescription: document.getElementById("meal-description"),
  mealImage: document.getElementById("meal-image"),
  imagePreviewWrap: document.getElementById("image-preview-wrap"),
  imagePreview: document.getElementById("image-preview"),
  removeImage: document.getElementById("remove-image"),
  cancelMeal: document.getElementById("cancel-meal"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
  monthLabel: document.getElementById("month-label"),
  calendarLayout: document.getElementById("calendar-layout"),
  calendarGrid: document.getElementById("calendar-grid"),
  dayPanel: document.getElementById("day-panel"),
  pickerDialog: document.getElementById("picker-dialog"),
  pickerTitle: document.getElementById("picker-title"),
  pickerList: document.getElementById("picker-list"),
  closePicker: document.getElementById("close-picker"),
  detailDialog: document.getElementById("detail-dialog"),
  detailBody: document.getElementById("detail-body"),
};

const state = load();
let visibleMonth = startOfMonth(new Date());
let selectedDate = dateKey(new Date());
let editingId = null;
let draftImage = null;
let imageRemoved = false;
let activeSlot = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { meals: [], logs: {} };
    const data = JSON.parse(raw);
    return {
      meals: Array.isArray(data.meals) ? data.meals : [],
      logs: data.logs && typeof data.logs === "object" ? data.logs : {},
    };
  } catch {
    return { meals: [], logs: {} };
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `meal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openSheet(sheet) {
  sheet.hidden = false;
  document.body.classList.add("sheet-open");
}

function closeSheet(sheet) {
  sheet.hidden = true;
  const anyOpen = [els.mealDialog, els.pickerDialog, els.detailDialog].some((item) => !item.hidden);
  if (!anyOpen) document.body.classList.remove("sheet-open");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mealById(id) {
  return state.meals.find((meal) => meal.id === id) || null;
}

function emptyDay() {
  return { breakfast: null, lunch: null, dinner: null };
}

function readDay(key) {
  return state.logs[key] || emptyDay();
}

function dayLog(key) {
  if (!state.logs[key]) state.logs[key] = emptyDay();
  return state.logs[key];
}

function showView(name) {
  const isBank = name === "bank";
  els.bank.hidden = !isBank;
  els.calendar.hidden = isBank;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
  if (!isBank) renderCalendar();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function renderBank() {
  if (state.meals.length === 0) {
    els.mealList.innerHTML = `<div class="empty-state">No meals yet. Add the meals you eat on this journey, then log them on the calendar.</div>`;
    return;
  }

  els.mealList.innerHTML = state.meals
    .map((meal) => {
      const photo = meal.image
        ? `<img src="${meal.image}" alt="" />`
        : "";
      const description = escapeHtml(meal.description || "No description yet.");
      return `
        <article class="meal-card">
          ${photo}
          <div class="meal-card-body">
            <h3>${escapeHtml(meal.name)}</h3>
            <p>${description}</p>
            <div class="card-actions">
              <button type="button" class="btn btn-ghost" data-edit="${meal.id}">Edit</button>
              <button type="button" class="btn btn-danger" data-delete="${meal.id}">Delete</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

els.mealList.addEventListener("click", (event) => {
  const editId = event.target.closest("[data-edit]")?.dataset.edit;
  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (editId) openMealForm(editId);
  if (deleteId) deleteMeal(deleteId);
});

els.addMeal.addEventListener("click", () => openMealForm(null));
els.cancelMeal.addEventListener("click", () => closeSheet(els.mealDialog));
els.removeImage.addEventListener("click", () => {
  draftImage = null;
  imageRemoved = true;
  els.mealImage.value = "";
  els.imagePreviewWrap.hidden = true;
});

els.mealImage.addEventListener("change", async () => {
  const file = els.mealImage.files?.[0];
  if (!file) return;
  try {
    draftImage = await resizeImage(file);
  } catch {
    draftImage = null;
    els.mealImage.value = "";
    return;
  }
  imageRemoved = false;
  els.imagePreview.src = draftImage;
  els.imagePreviewWrap.hidden = false;
});

els.mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.mealName.value.trim();
  if (!name) {
    els.mealName.focus();
    return;
  }
  const description = els.mealDescription.value.trim();
  if (editingId) {
    const meal = mealById(editingId);
    if (!meal) return;
    meal.name = name;
    meal.description = description;
    if (draftImage) meal.image = draftImage;
    else if (imageRemoved) meal.image = "";
  } else {
    state.meals.push({
      id: uid(),
      name,
      description,
      image: draftImage || "",
    });
  }
  save();
  closeSheet(els.mealDialog);
  renderBank();
});

function openMealForm(id) {
  editingId = id;
  const meal = id ? mealById(id) : null;
  draftImage = null;
  imageRemoved = false;
  els.mealFormTitle.textContent = meal ? "Edit meal" : "Add meal";
  els.mealName.value = meal?.name || "";
  els.mealDescription.value = meal?.description || "";
  els.mealImage.value = "";
  if (meal?.image) {
    els.imagePreview.src = meal.image;
    els.imagePreviewWrap.hidden = false;
  } else {
    els.imagePreviewWrap.hidden = true;
  }
  openSheet(els.mealDialog);
  els.mealName.focus();
}

function deleteMeal(id) {
  const meal = mealById(id);
  if (!meal) return;
  const ok = confirm(`Delete “${meal.name}”? It will also be removed from every day you logged it.`);
  if (!ok) return;
  state.meals = state.meals.filter((item) => item.id !== id);
  for (const log of Object.values(state.logs)) {
    for (const slot of SLOTS) {
      if (log[slot.id] === id) log[slot.id] = null;
    }
  }
  save();
  renderBank();
  renderCalendar();
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  els.monthLabel.textContent = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const selected = parseKey(selectedDate);
  if (selected.getFullYear() !== year || selected.getMonth() !== month) {
    const today = new Date();
    selectedDate = today.getFullYear() === year && today.getMonth() === month
      ? dateKey(today)
      : dateKey(new Date(year, month, 1));
  }

  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const todayKey = dateKey(new Date());
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const key = dateKey(date);
    const outside = date.getMonth() !== month;
    const log = readDay(key);
    const hasMeal = SLOTS.some((slot) => log[slot.id] && mealById(log[slot.id]));
    const label = date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    cells.push(`
      <button type="button" class="day-num${outside ? " is-outside" : ""}${key === todayKey ? " is-today" : ""}${key === selectedDate ? " is-selected" : ""}" data-pick-date="${key}" aria-pressed="${key === selectedDate}" aria-label="${escapeHtml(label)}">
        <span>${date.getDate()}</span>
        <span class="day-dot${hasMeal ? " is-marked" : ""}"></span>
      </button>`);
  }

  els.calendarGrid.innerHTML = cells.join("");
  renderDayPanel();
}

function renderDayPanel() {
  const date = parseKey(selectedDate);
  const heading = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const log = readDay(selectedDate);
  const slots = SLOTS.map((slot) => renderSlot(selectedDate, slot, log[slot.id])).join("");
  els.dayPanel.innerHTML = `
    <h3>${escapeHtml(heading)}</h3>
    <div class="day-slots">${slots}</div>`;
}

function renderSlot(key, slot, mealId) {
  const meal = mealId ? mealById(mealId) : null;
  if (!meal) {
    return `
      <button type="button" class="slot" data-date="${key}" data-slot="${slot.id}">
        <span>
          <span class="slot-label">${slot.label}</span>
          <span class="slot-empty">Add</span>
        </span>
      </button>`;
  }
  const thumb = meal.image ? `<img class="slot-thumb" src="${meal.image}" alt="" />` : "";
  return `
    <button type="button" class="slot is-filled" data-date="${key}" data-slot="${slot.id}">
      ${thumb}
      <span>
        <span class="slot-label">${slot.label}</span>
        <span class="slot-name">${escapeHtml(meal.name)}</span>
      </span>
    </button>`;
}

els.prevMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  renderCalendar();
});

els.nextMonth.addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  renderCalendar();
});

els.calendarLayout.addEventListener("click", (event) => {
  const day = event.target.closest("[data-pick-date]");
  if (day) {
    selectedDate = day.dataset.pickDate;
    const picked = parseKey(selectedDate);
    if (picked.getMonth() !== visibleMonth.getMonth() || picked.getFullYear() !== visibleMonth.getFullYear()) {
      visibleMonth = startOfMonth(picked);
    }
    renderCalendar();
    return;
  }
  const button = event.target.closest("[data-slot]");
  if (!button) return;
  const date = button.dataset.date;
  const slot = button.dataset.slot;
  const mealId = readDay(date)[slot];
  const meal = mealId ? mealById(mealId) : null;
  if (meal) openDetail(date, slot, meal);
  else openPicker(date, slot);
});

function openPicker(date, slot) {
  activeSlot = { date, slot };
  const slotLabel = SLOTS.find((item) => item.id === slot)?.label || "Meal";
  const pretty = parseKey(date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  els.pickerTitle.textContent = `${slotLabel} · ${pretty}`;
  if (state.meals.length === 0) {
    els.pickerList.innerHTML = `
      <div class="empty-state">
        Your meal bank is empty.
        <div class="detail-actions">
          <button type="button" class="btn btn-primary" id="picker-go-bank">Add a meal</button>
        </div>
      </div>`;
  } else {
    els.pickerList.innerHTML = state.meals
      .map((meal) => {
        const thumb = meal.image ? `<img src="${meal.image}" alt="" />` : "";
        return `
          <button type="button" class="picker-item" data-pick="${meal.id}">
            ${thumb}
            <strong>${escapeHtml(meal.name)}</strong>
          </button>`;
      })
      .join("");
  }
  openSheet(els.pickerDialog);
}

els.pickerList.addEventListener("click", (event) => {
  const goBank = event.target.closest("#picker-go-bank");
  if (goBank) {
    closeSheet(els.pickerDialog);
    showView("bank");
    return;
  }
  const id = event.target.closest("[data-pick]")?.dataset.pick;
  if (!id || !activeSlot) return;
  const log = dayLog(activeSlot.date);
  log[activeSlot.slot] = id;
  save();
  closeSheet(els.pickerDialog);
  renderCalendar();
});

els.closePicker.addEventListener("click", () => closeSheet(els.pickerDialog));

function openDetail(date, slot, meal) {
  activeSlot = { date, slot };
  const photo = meal.image ? `<img class="detail-photo" src="${meal.image}" alt="" />` : "";
  const description = meal.description
    ? escapeHtml(meal.description)
    : "No description yet.";
  els.detailBody.innerHTML = `
    ${photo}
    <div class="detail-copy">
      <h3>${escapeHtml(meal.name)}</h3>
      <p>${description}</p>
    </div>
    <div class="detail-actions">
      <button type="button" class="btn btn-primary" id="detail-change">Change meal</button>
      <button type="button" class="btn btn-danger" id="detail-clear">Remove from this day</button>
      <button type="button" class="btn btn-ghost" id="detail-close">Close</button>
    </div>`;
  openSheet(els.detailDialog);
}

els.detailBody.addEventListener("click", (event) => {
  if (event.target.closest("#detail-close")) {
    closeSheet(els.detailDialog);
    return;
  }
  if (event.target.closest("#detail-clear") && activeSlot) {
    dayLog(activeSlot.date)[activeSlot.slot] = null;
    save();
    closeSheet(els.detailDialog);
    renderCalendar();
    return;
  }
  if (event.target.closest("#detail-change") && activeSlot) {
    const slot = activeSlot;
    closeSheet(els.detailDialog);
    openPicker(slot.date, slot.slot);
  }
});

renderBank();
renderCalendar();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
