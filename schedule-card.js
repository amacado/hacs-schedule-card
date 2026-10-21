const DAYS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
];

const emptySchedule = (name = "New schedule") => ({
  name,
  ...Object.fromEntries(DAYS.map(([day]) => [day, []])),
});

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
      character
    ],
  );

const minutes = (value) => {
  const [hours, mins] = String(value).split(":").map(Number);
  return hours * 60 + mins;
};

const formatTime = (value) => String(value ?? "").slice(0, 5);

class ScheduleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
    this._loading = false;
    this._error = "";
    this._draft = null;
    this._busy = false;
    this._subscription = null;
  }

  setConfig(config) {
    this._config = { title: "Schedules", ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) this._load();
    else this._render();
  }

  getCardSize() {
    return Math.max(3, this._items.length * 3);
  }

  async _load() {
    if (!this._hass) return;
    this._loading = true;
    this._error = "";
    this._render();
    try {
      this._items = await this._hass.callWS({ type: "schedule/list" });
      this._loaded = true;
      this._subscribe();
    } catch (error) {
      this._error = error.message || "Unable to load schedules.";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _subscribe() {
    if (this._subscription || !this._hass?.connection?.subscribeMessage) return;
    try {
      this._subscription = await this._hass.connection.subscribeMessage(
        (changes) => {
          for (const change of changes) {
            const index = this._items.findIndex((item) => item.id === change.schedule_id);
            if (change.change_type === "removed") {
              if (index !== -1) this._items.splice(index, 1);
            } else if (index === -1) {
              this._items.push(change.item);
            } else {
              this._items[index] = change.item;
            }
          }
          this._render();
        },
        { type: "schedule/subscribe" },
      );
    } catch (_error) {
      this._subscription = null;
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const title = escapeHtml(this._config.title);
    const message = this._loading
      ? '<div class="message">Loading schedules...</div>'
      : this._error
        ? `<div class="message error">${escapeHtml(this._error)}</div>`
        : this._items.length
          ? this._items.map((item) => this._renderSchedule(item)).join("")
          : '<div class="message">No stored schedules yet.</div>';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: var(--primary-text-color, #202a2a); }
        * { box-sizing: border-box; }
        .card { padding: 16px; border: 1px solid var(--divider-color, #d9e1df); border-radius: 8px; background: var(--ha-card-background, var(--card-background-color, #fff)); }
        header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
        h2 { margin: 0; font-size: 18px; font-weight: 600; }
        button { min-height: 34px; padding: 6px 11px; border: 1px solid var(--divider-color, #d9e1df); border-radius: 5px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
        button:hover { background: var(--secondary-background-color, #f2f5f4); }
        button.primary { border-color: var(--primary-color, #087f72); background: var(--primary-color, #087f72); color: var(--text-primary-color, white); }
        button.danger { color: var(--error-color, #b3261e); }
        button:disabled { opacity: .55; cursor: wait; }
        .schedule { padding: 12px 0 14px; border-top: 1px solid var(--divider-color, #d9e1df); }
        .schedule-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .schedule-title { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .schedule-title h3 { overflow: hidden; margin: 0; font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .state { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--disabled-text-color, #899391); }
        .state.on { background: var(--success-color, #21835b); }
        .actions { display: flex; gap: 6px; flex: none; }
        .timeline { min-width: 440px; }
        .scroll { overflow-x: auto; }
        .axis, .day-row { display: grid; grid-template-columns: 36px minmax(400px, 1fr); gap: 8px; }
        .axis { margin-bottom: 3px; color: var(--secondary-text-color, #687270); font-size: 10px; }
        .hours { display: flex; justify-content: space-between; padding: 0 1px; }
        .day-row { min-height: 26px; align-items: center; }
        .day-name { color: var(--secondary-text-color, #687270); font-size: 11px; }
        .track { position: relative; height: 18px; border-radius: 3px; background: repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--divider-color, #d9e1df) calc(25% - 1px), var(--divider-color, #d9e1df) 25%); }
        .range { position: absolute; top: 1px; height: 16px; min-width: 2px; overflow: hidden; padding: 1px 4px; border-radius: 3px; background: var(--primary-color, #087f72); color: var(--text-primary-color, white); font-size: 10px; line-height: 14px; text-overflow: clip; white-space: nowrap; }
        .empty { position: absolute; top: 2px; left: 4px; color: var(--secondary-text-color, #687270); font-size: 10px; }
        .message { padding: 12px 0; color: var(--secondary-text-color, #687270); }
        .error { color: var(--error-color, #b3261e); }
        .editor { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--divider-color, #d9e1df); }
        .field-label { display: block; margin: 0 0 5px; color: var(--secondary-text-color, #687270); font-size: 12px; }
        input { min-width: 0; min-height: 34px; padding: 6px 8px; border: 1px solid var(--divider-color, #d9e1df); border-radius: 4px; background: var(--input-fill-color, var(--card-background-color, #fff)); color: inherit; font: inherit; }
        .name-input { width: min(100%, 360px); margin-bottom: 12px; }
        .edit-day { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px 0; border-top: 1px solid var(--divider-color, #d9e1df); }
        .edit-day-name { padding-top: 7px; font-size: 12px; font-weight: 600; }
        .ranges { display: grid; gap: 6px; }
        .edit-range { display: grid; grid-template-columns: minmax(85px, 120px) minmax(85px, 120px) minmax(90px, 1fr) 34px; gap: 6px; }
        .range-data { width: 100%; }
        .remove { min-width: 34px; padding: 4px; }
        .add-day { margin-top: 6px; font-size: 12px; }
        .editor-error { margin: 8px 0; color: var(--error-color, #b3261e); font-size: 13px; }
        .editor-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        @media (max-width: 520px) {
          .card { padding: 12px; }
          .edit-range { grid-template-columns: 1fr 1fr 34px; }
          .range-data { grid-column: 1 / 3; grid-row: 2; }
          .remove { grid-column: 3; grid-row: 1 / 3; height: 100%; }
        }
      </style>
      <section class="card">
        <header><h2>${title}</h2><button class="primary" data-action="new">Add schedule</button></header>
        ${message}
      </section>`;
    this.shadowRoot.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled = this._busy;
    });
    this.shadowRoot.onclick = (event) => this._onClick(event);
    this.shadowRoot.oninput = (event) => this._onInput(event);
  }

  _renderSchedule(item) {
    const entity = this._hass?.states?.[`schedule.${item.id}`];
    const isEditing = this._draft?.id === item.id;
    return `
      <article class="schedule">
        <div class="schedule-head">
          <div class="schedule-title"><span class="state ${entity?.state === "on" ? "on" : ""}"></span><h3>${escapeHtml(item.name)}</h3></div>
          <div class="actions"><button data-action="${isEditing ? "cancel" : "edit"}" data-id="${escapeHtml(item.id)}">${isEditing ? "Cancel" : "Edit"}</button><button class="danger" data-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.name)}" title="Delete schedule">Delete</button></div>
        </div>
        ${this._renderTimeline(item)}
        ${isEditing ? this._renderEditor(this._draft) : ""}
      </article>`;
  }

  _renderTimeline(item) {
    return `<div class="scroll"><div class="timeline">
      <div class="axis"><span></span><div class="hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
      ${DAYS.map(([day, label]) => {
        const ranges = [...(item[day] || [])].sort((a, b) => a.from.localeCompare(b.from));
        return `<div class="day-row"><span class="day-name">${label}</span><div class="track">${ranges.length ? ranges.map((range) => {
          const start = minutes(range.from);
          const end = minutes(range.to);
          const left = (start / 1440) * 100;
          const width = ((end - start) / 1440) * 100;
          return `<span class="range" style="left:${left}%;width:${width}%" title="${escapeHtml(formatTime(range.from))}-${escapeHtml(formatTime(range.to))}">${escapeHtml(formatTime(range.from))}-${escapeHtml(formatTime(range.to))}</span>`;
        }).join("") : '<span class="empty">No times</span>'}</div></div>`;
      }).join("")}
    </div></div>`;
  }

  _renderEditor(draft) {
    return `<div class="editor">
      <label class="field-label" for="schedule-name">Name</label>
      <input id="schedule-name" class="name-input" data-field="name" value="${escapeHtml(draft.name)}" maxlength="100">
      ${DAYS.map(([day, label]) => `<div class="edit-day">
        <div class="edit-day-name">${label}</div>
        <div class="ranges">${(draft[day] || []).map((range, index) => `<div class="edit-range">
          <input type="text" inputmode="numeric" aria-label="${label} start (HH:MM)" placeholder="HH:MM" maxlength="5" data-day="${day}" data-index="${index}" data-key="from" value="${escapeHtml(formatTime(range.from))}" required>
          <input type="text" inputmode="numeric" aria-label="${label} end (HH:MM)" placeholder="HH:MM" maxlength="5" data-day="${day}" data-index="${index}" data-key="to" value="${escapeHtml(formatTime(range.to))}" required>
          <input class="range-data" aria-label="${label} action data as JSON" placeholder="Action data (JSON)" data-day="${day}" data-index="${index}" data-key="data" value="${escapeHtml(range.data ? JSON.stringify(range.data) : "")}">
          <button class="remove" data-action="remove" data-day="${day}" data-index="${index}" aria-label="Remove ${label} time">Remove</button>
        </div>`).join("")}<button class="add-day" data-action="add" data-day="${day}">Add time</button></div>
      </div>`).join("")}
      ${this._editorError ? `<div class="editor-error" role="alert">${escapeHtml(this._editorError)}</div>` : ""}
      <div class="editor-actions"><button class="primary" data-action="save" data-id="${escapeHtml(draft.id || "")}">Save</button><button data-action="cancel">Cancel</button></div>
    </div>`;
  }

  _onInput(event) {
    const field = event.target.dataset.field;
    if (field === "name" && this._draft) this._draft.name = event.target.value;
    const { day, index, key } = event.target.dataset;
    if (day && key && this._draft?.[day]?.[index]) {
      this._draft[day][index][key] = event.target.value;
    }
  }

  async _onClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || this._busy) return;
    const { action, id, day, index } = button.dataset;
    this._editorError = "";

    if (action === "new") {
      this._draft = { ...emptySchedule(), id: "" };
    } else if (action === "edit") {
      const item = this._items.find((schedule) => schedule.id === id);
      if (item) this._draft = JSON.parse(JSON.stringify(item));
    } else if (action === "cancel") {
      this._draft = null;
    } else if (action === "add") {
      this._draft[day].push({ from: "09:00", to: "17:00" });
    } else if (action === "remove") {
      this._draft[day].splice(Number(index), 1);
    } else if (action === "save") {
      await this._save(id);
      return;
    } else if (action === "delete") {
      const item = this._items.find((schedule) => schedule.id === id);
      if (!item || !window.confirm(`Delete schedule "${item.name}"?`)) return;
      await this._delete(id);
      return;
    }
    this._render();
  }

  async _save(id) {
    const name = this._draft.name.trim();
    if (!name) {
      this._editorError = "Enter a name for this schedule.";
      this._render();
      return;
    }
    const payload = { name };
    try {
      for (const [day] of DAYS) {
        payload[day] = this._draft[day].map((range) => {
          const normalized = { from: range.from, to: range.to };
          if (!normalized.from || !normalized.to) throw new Error("Each time range needs a start and end.");
          if (range.data !== undefined && range.data !== "") {
            const data = typeof range.data === "string" ? JSON.parse(range.data) : range.data;
            if (!data || Array.isArray(data) || typeof data !== "object") {
              throw new Error("Action data must be a JSON object.");
            }
            normalized.data = data;
          }
          return normalized;
        });
      }
      this._busy = true;
      this._render();
      const result = id
        ? await this._hass.callWS({ type: "schedule/update", schedule_id: id, ...payload })
        : await this._hass.callWS({ type: "schedule/create", ...payload });
      const existing = this._items.findIndex((schedule) => schedule.id === result.id);
      if (existing === -1) this._items.push(result);
      else this._items[existing] = result;
      this._draft = null;
    } catch (error) {
      this._editorError = error.message || "Unable to save schedule.";
    } finally {
      this._busy = false;
      this._render();
    }
  }

  async _delete(id) {
    this._busy = true;
    this._render();
    try {
      await this._hass.callWS({ type: "schedule/delete", schedule_id: id });
      this._items = this._items.filter((item) => item.id !== id);
      if (this._draft?.id === id) this._draft = null;
      this._error = "";
    } catch (error) {
      this._error = error.message || "Unable to delete schedule.";
    } finally {
      this._busy = false;
      this._render();
    }
  }
}

if (!customElements.get("schedule-card")) {
  customElements.define("schedule-card", ScheduleCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "schedule-card",
  name: "Schedule Card",
  description: "Visualize and edit stored Home Assistant schedules.",
});