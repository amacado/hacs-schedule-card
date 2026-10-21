const DAYS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
];

const COLORS = ["#c99bf2", "#5ec7b1", "#f2a278", "#78aee8", "#e8cc63", "#e58bb6", "#9bc979"];

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

const TEXT = {
  en: { title: "Schedules", add: "Add schedule", edit: "Edit", delete: "Delete", cancel: "Cancel", save: "Save", loading: "Loading schedules...", empty: "No stored schedules yet.", noTimes: "No times", choose: "Choose schedules in the card settings.", missing: "Selected schedules are not available.", confirm: 'Delete schedule "{name}"?', nameRequired: "Enter a name for this schedule.", timeRequired: "Each time range needs a start and end.", jsonInvalid: "Action data must be valid JSON.", jsonObject: "Action data must be a JSON object.", saveError: "Unable to save schedule.", deleteError: "Unable to delete schedule.", view: "Display", week: "Whole week", day: "Single day", whichDay: "Day", today: "Today", titleLabel: "Title", showHeader: "Show header", addTime: "Add time", removeTime: "Remove time", start: "Start", end: "End", actionData: "Action data (JSON)", noEntities: "No editable schedule entities found." },
  de: { title: "Zeitpläne", add: "Zeitplan hinzufügen", edit: "Bearbeiten", delete: "Löschen", cancel: "Abbrechen", save: "Speichern", loading: "Zeitpläne werden geladen...", empty: "Keine gespeicherten Zeitpläne.", noTimes: "Keine Zeiten", choose: "Wähle Zeitpläne in den Karteneinstellungen.", missing: "Ausgewählte Zeitpläne sind nicht verfügbar.", confirm: 'Zeitplan "{name}" löschen?', nameRequired: "Gib einen Namen für diesen Zeitplan ein.", timeRequired: "Jeder Zeitraum benötigt einen Start und ein Ende.", jsonInvalid: "Die Aktionsdaten müssen gültiges JSON sein.", jsonObject: "Die Aktionsdaten müssen ein JSON-Objekt sein.", saveError: "Zeitplan konnte nicht gespeichert werden.", deleteError: "Zeitplan konnte nicht gelöscht werden.", view: "Anzeige", week: "Ganze Woche", day: "Einzelner Tag", whichDay: "Wochentag", today: "Heute", titleLabel: "Titel", showHeader: "Kopfzeile anzeigen", addTime: "Zeit hinzufügen", removeTime: "Zeit entfernen", start: "Start", end: "Ende", actionData: "Aktionsdaten (JSON)", noEntities: "Keine bearbeitbaren Zeitplan-Entitäten gefunden." },
};

const localeFor = (hass) => (hass?.language || navigator.language || "en").split(/[-_]/)[0].toLowerCase();

const localize = (hass, key, values = {}) => {
  let text = (TEXT[localeFor(hass)] || TEXT.en)[key] || TEXT.en[key] || key;
  for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value);
  return text;
};

const dayLabel = (hass, index, width = "short") =>
  new Intl.DateTimeFormat(localeFor(hass), { weekday: width, timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  );

class ScheduleCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("schedule-card-editor");
  }

  static getStubConfig() {
    return { entities: [], view: "week", day: "today", show_header: true };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
    this._loading = false;
    this._error = "";
    this._draft = null;
    this._busy = false;
    this._subscription = null;
    this._labelObserver = new ResizeObserver(() => this._fitRangeLabels());
  }

  connectedCallback() {
    this._labelObserver.observe(this);
  }

  disconnectedCallback() {
    this._labelObserver.disconnect();
    this._subscription?.();
  }

  setConfig(config) {
    this._config = {
      view: "week",
      day: "today",
      show_header: true,
      ...config,
      entities: config.entities || (config.entity ? [config.entity] : []),
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) this._load();
    else this._render();
  }

  getCardSize() {
    return Math.max(3, this._selectedItems().length * (this._config?.view === "day" ? 2 : 10));
  }

  _selectedItems() {
    const selected = this._config?.entities || [];
    if (!selected.length) return this._items;
    const schedulesByEntity = new Map(this._items.map((item) => [`schedule.${item.id}`, item]));
    return selected.map((entityId) => schedulesByEntity.get(entityId)).filter(Boolean);
  }

  _visibleDays() {
    if (this._config?.view !== "day") return DAYS.map(([day], index) => [day, index]);
    const day = this._config.day === "today"
      ? DAYS[(new Date().getDay() + 6) % 7][0]
      : this._config.day || "monday";
    const index = DAYS.findIndex(([key]) => key === day);
    return index < 0 ? [[DAYS[0][0], 0]] : [[day, index]];
  }

  _colorFor(item, index) {
    const entityId = `schedule.${item.id}`;
    const configured = this._config.colors?.[entityId];
    return /^#[\da-f]{3,8}$/i.test(configured || "")
      ? configured
      : COLORS[index % COLORS.length];
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
    const items = this._selectedItems();
    const title = escapeHtml(this._config.title || localize(this._hass, "title"));
    const missing = (this._config.entities || []).some(
      (entityId) => !this._items.some((item) => `schedule.${item.id}` === entityId),
    );
    const message = this._loading
      ? `<div class="message">${escapeHtml(localize(this._hass, "loading"))}</div>`
      : this._error
        ? `<div class="message error">${escapeHtml(this._error)}</div>`
        : missing
          ? `<div class="message">${escapeHtml(localize(this._hass, "missing"))}</div>`
          : items.length
            ? `${this._renderLegend(items)}${this._renderTimeline(items)}`
            : `<div class="message">${escapeHtml(this._config.entities?.length ? localize(this._hass, "missing") : localize(this._hass, "empty"))}</div>`;
    const newEditor = this._draft && !this._draft.id ? this._renderEditor(this._draft) : "";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: var(--primary-text-color, #d6d9ef); }
        * { box-sizing: border-box; }
        .card { padding: 16px 20px; border: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); border-radius: var(--bubble-border-radius, 14px); background: var(--bubble-main-background-color, var(--ha-card-background, var(--card-background-color, #252739))); }
        header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); }
        h2 { margin: 0; font-size: 18px; font-weight: 650; }
        button { display: inline-grid; place-items: center; min-width: 34px; min-height: 34px; padding: 6px; border: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
        button:hover { background: var(--secondary-background-color, rgb(255 255 255 / 7%)); }
        button.primary { border-color: var(--primary-color, #c99bf2); background: var(--primary-color, #c99bf2); color: var(--text-primary-color, #211d2a); }
        ha-icon { --mdc-icon-size: 20px; }
        button.danger { color: var(--error-color, #b3261e); }
        button:disabled { opacity: .55; cursor: wait; }
        .toolbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
        .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 2px 0 12px; }
        .legend-item { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .swatch { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--schedule-color); }
        .legend-name { overflow: hidden; max-width: 180px; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .legend-actions { display: flex; gap: 3px; margin-left: 2px; }
        .legend-actions button { min-width: 30px; min-height: 30px; border: 0; }
        .timeline { min-width: 420px; }
        .scroll { overflow-x: auto; }
        .axis, .day-row { display: grid; grid-template-columns: 40px minmax(360px, 1fr); gap: 8px; }
        .axis { margin-bottom: 4px; color: var(--secondary-text-color, #b8bed8); font-size: 11px; }
        .hours { display: flex; justify-content: space-between; padding: 0 1px; }
        .day-row { min-height: 28px; align-items: center; }
        .day-name { color: var(--secondary-text-color, #b8bed8); font-size: 12px; }
        .tracks { display: grid; gap: 3px; }
        .track { position: relative; height: 19px; border-radius: 4px; background: repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--bubble-border-color, var(--divider-color, #36394f)) calc(25% - 1px), var(--bubble-border-color, var(--divider-color, #36394f)) 25%); }
        .range { position: absolute; top: 1px; height: 17px; min-width: 2px; overflow: hidden; padding: 1px 5px; border-radius: 4px; background: var(--schedule-color); color: var(--schedule-text-color, #241e2d); font-size: 11px; line-height: 15px; white-space: nowrap; }
        .empty { position: absolute; top: 2px; left: 4px; color: var(--secondary-text-color, #b8bed8); font-size: 10px; }
        .message { padding: 12px 0; color: var(--secondary-text-color, #b8bed8); }
        .error { color: var(--error-color, #b3261e); }
        .editor { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); }
        .field-label { display: block; margin: 0 0 5px; color: var(--secondary-text-color, #687270); font-size: 12px; }
        input { min-width: 0; min-height: 34px; padding: 6px 8px; border: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); border-radius: 6px; background: var(--input-fill-color, var(--card-background-color, #252739)); color: inherit; font: inherit; }
        .name-input { width: min(100%, 360px); margin-bottom: 12px; }
        .edit-day { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px 0; border-top: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); }
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
        ${this._config.show_header ? `<header><h2>${title}</h2><button class="icon-button primary" data-action="new" aria-label="${escapeHtml(localize(this._hass, "add"))}" title="${escapeHtml(localize(this._hass, "add"))}"><ha-icon icon="mdi:plus"></ha-icon></button></header>` : `<div class="toolbar"><button class="icon-button primary" data-action="new" aria-label="${escapeHtml(localize(this._hass, "add"))}" title="${escapeHtml(localize(this._hass, "add"))}"><ha-icon icon="mdi:plus"></ha-icon></button></div>`}
        ${message}
        ${this._draft?.id ? this._renderEditor(this._draft) : ""}
        ${newEditor}
      </section>`;
    this.shadowRoot.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled = this._busy;
    });
    this.shadowRoot.onclick = (event) => this._onClick(event);
    this.shadowRoot.oninput = (event) => this._onInput(event);
    this._fitRangeLabels();
  }

  _renderLegend(items) {
    return `<div class="legend">${items.map((item, index) => {
      const entityId = `schedule.${item.id}`;
      const color = escapeHtml(this._colorFor(item, index));
      return `<div class="legend-item" style="--schedule-color:${color}">
        <span class="swatch"></span><span class="legend-name">${escapeHtml(item.name)}</span>
        <div class="legend-actions">
          <button data-action="${this._draft?.id === item.id ? "cancel" : "edit"}" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(localize(this._hass, this._draft?.id === item.id ? "cancel" : "edit"))}" title="${escapeHtml(localize(this._hass, this._draft?.id === item.id ? "cancel" : "edit"))}"><ha-icon icon="${this._draft?.id === item.id ? "mdi:close" : "mdi:pencil"}"></ha-icon></button>
          <button class="danger" data-action="delete" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(localize(this._hass, "delete"))} ${escapeHtml(item.name)}" title="${escapeHtml(localize(this._hass, "delete"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  _renderTimeline(items) {
    return `<div class="scroll"><div class="timeline">
      <div class="axis"><span></span><div class="hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
      ${this._visibleDays().map(([day, dayIndex]) => {
        const tracks = items.map((item, itemIndex) => {
          const ranges = [...(item[day] || [])].sort((a, b) => a.from.localeCompare(b.from));
          const color = escapeHtml(this._colorFor(item, itemIndex));
          const segments = ranges.map((range) => {
            const start = minutes(range.from);
            const end = minutes(range.to);
            const left = (start / 1440) * 100;
            const width = ((end - start) / 1440) * 100;
            const label = `${formatTime(range.from)}-${formatTime(range.to)}`;
            return `<span class="range" data-label="${escapeHtml(label)}" aria-label="${escapeHtml(`${item.name}, ${label}`)}" style="--schedule-color:${color};left:${left}%;width:${width}%">${escapeHtml(label)}</span>`;
          }).join("");
          return `<div class="track" style="--schedule-color:${color}">${segments || `<span class="empty">${escapeHtml(localize(this._hass, "noTimes"))}</span>`}</div>`;
        }).join("");
        return `<div class="day-row"><span class="day-name">${escapeHtml(dayLabel(this._hass, dayIndex))}</span><div class="tracks">${tracks}</div></div>`;
      }).join("")}
    </div></div>`;
  }

  _fitRangeLabels() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    this.shadowRoot?.querySelectorAll(".range[data-label]").forEach((range) => {
      const label = range.dataset.label;
      const style = window.getComputedStyle(range);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      if (context) context.font = style.font;
      const labelWidth = context ? context.measureText(label).width : label.length * 7;
      const fits = labelWidth <= range.clientWidth - padding;
      range.textContent = fits ? label : "";
      if (fits) range.removeAttribute("title");
      else range.title = label;
    });
  }

  _renderEditor(draft) {
    return `<div class="editor">
      <label class="field-label" for="schedule-name">${escapeHtml(localize(this._hass, "titleLabel"))}</label>
      <input id="schedule-name" class="name-input" data-field="name" value="${escapeHtml(draft.name)}" maxlength="100">
      ${DAYS.map(([day], dayIndex) => {
        const label = dayLabel(this._hass, dayIndex, "long");
        return `<div class="edit-day">
        <div class="edit-day-name">${escapeHtml(label)}</div>
        <div class="ranges">${(draft[day] || []).map((range, index) => `<div class="edit-range">
          <input type="text" inputmode="numeric" aria-label="${escapeHtml(label)} ${escapeHtml(localize(this._hass, "start"))} (HH:MM)" placeholder="HH:MM" maxlength="5" data-day="${day}" data-index="${index}" data-key="from" value="${escapeHtml(formatTime(range.from))}" required>
          <input type="text" inputmode="numeric" aria-label="${escapeHtml(label)} ${escapeHtml(localize(this._hass, "end"))} (HH:MM)" placeholder="HH:MM" maxlength="5" data-day="${day}" data-index="${index}" data-key="to" value="${escapeHtml(formatTime(range.to))}" required>
          <input class="range-data" aria-label="${escapeHtml(label)} ${escapeHtml(localize(this._hass, "actionData"))}" placeholder="${escapeHtml(localize(this._hass, "actionData"))}" data-day="${day}" data-index="${index}" data-key="data" value="${escapeHtml(range.data ? JSON.stringify(range.data) : "")}">
          <button class="remove icon-button" data-action="remove" data-day="${day}" data-index="${index}" aria-label="${escapeHtml(localize(this._hass, "removeTime"))}" title="${escapeHtml(localize(this._hass, "removeTime"))}"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
        </div>`).join("")}<button class="add-day icon-button" data-action="add" data-day="${day}" aria-label="${escapeHtml(localize(this._hass, "addTime"))}" title="${escapeHtml(localize(this._hass, "addTime"))}"><ha-icon icon="mdi:plus"></ha-icon></button></div>
      </div>`;
      }).join("")}
      ${this._editorError ? `<div class="editor-error" role="alert">${escapeHtml(this._editorError)}</div>` : ""}
      <div class="editor-actions"><button class="primary icon-button" data-action="save" aria-label="${escapeHtml(localize(this._hass, "save"))}" title="${escapeHtml(localize(this._hass, "save"))}"><ha-icon icon="mdi:check"></ha-icon></button><button class="icon-button" data-action="cancel" aria-label="${escapeHtml(localize(this._hass, "cancel"))}" title="${escapeHtml(localize(this._hass, "cancel"))}"><ha-icon icon="mdi:close"></ha-icon></button></div>
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
      await this._save();
      return;
    } else if (action === "delete") {
      const item = this._items.find((schedule) => schedule.id === id);
      if (!item || !window.confirm(localize(this._hass, "confirm", { name: item.name }))) return;
      await this._delete(id);
      return;
    }
    this._render();
  }

  async _save() {
    const name = this._draft.name.trim();
    if (!name) {
      this._editorError = localize(this._hass, "nameRequired");
      this._render();
      return;
    }
    const scheduleId = this._draft.id;
    const payload = { name, ...(this._draft.icon ? { icon: this._draft.icon } : {}) };
    try {
      for (const [day] of DAYS) {
        payload[day] = this._draft[day].map((range) => {
          const normalized = { from: range.from, to: range.to };
          if (!normalized.from || !normalized.to) throw new Error(localize(this._hass, "timeRequired"));
          if (range.data !== undefined && range.data !== "") {
            let data;
            try {
              data = typeof range.data === "string" ? JSON.parse(range.data) : range.data;
            } catch (_error) {
              throw new Error(localize(this._hass, "jsonInvalid"));
            }
            if (!data || Array.isArray(data) || typeof data !== "object") {
              throw new Error(localize(this._hass, "jsonObject"));
            }
            normalized.data = data;
          }
          return normalized;
        });
      }
      this._busy = true;
      this._render();
      const result = scheduleId
        ? await this._hass.callWS({ type: "schedule/update", schedule_id: scheduleId, ...payload })
        : await this._hass.callWS({ type: "schedule/create", ...payload });
      const saved = result?.id ? result : { ...payload, id: scheduleId };
      const existing = this._items.findIndex((schedule) => schedule.id === saved.id);
      if (existing === -1) this._items.push(saved);
      else this._items[existing] = saved;
      this._draft = null;
    } catch (error) {
      this._editorError = error.message || localize(this._hass, "saveError");
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
      this._error = error.message || localize(this._hass, "deleteError");
    } finally {
      this._busy = false;
      this._render();
    }
  }
}

class ScheduleCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = {
      view: "week",
      day: "today",
      show_header: true,
      ...config,
      entities: config.entities || (config.entity ? [config.entity] : []),
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _entities() {
    return Object.values(this._hass?.states || {})
      .filter((state) => state.entity_id.startsWith("schedule.") && state.attributes?.editable !== false)
      .sort((first, second) => (first.attributes.friendly_name || first.entity_id).localeCompare(second.attributes.friendly_name || second.entity_id));
  }

  _updateConfig(changes) {
    this._config = { ...this._config, ...changes };
    const config = { ...this._config };
    delete config.entity;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const selected = this._config.entities || [];
    const entities = this._entities();
    const locale = this._hass;
    const entityRows = entities.map((state) => {
      const entityId = state.entity_id;
      const name = state.attributes.friendly_name || entityId;
      const checked = selected.includes(entityId);
      const colorIndex = Math.max(0, selected.indexOf(entityId));
      const color = this._config.colors?.[entityId] || COLORS[colorIndex % COLORS.length];
      return `<div class="entity-row">
        <label class="entity-name"><input type="checkbox" data-entity="${escapeHtml(entityId)}" ${checked ? "checked" : ""}><span class="swatch" style="--schedule-color:${escapeHtml(color)}"></span><span>${escapeHtml(name)}</span></label>
        ${checked ? `<input class="color" type="color" data-color-entity="${escapeHtml(entityId)}" value="${escapeHtml(color)}" aria-label="${escapeHtml(name)} color" title="${escapeHtml(name)} color">` : ""}
      </div>`;
    }).join("");
    const dayOptions = [`<option value="today" ${this._config.day === "today" ? "selected" : ""}>${escapeHtml(localize(locale, "today"))}</option>`, ...DAYS.map(([day], index) => `<option value="${day}" ${this._config.day === day ? "selected" : ""}>${escapeHtml(dayLabel(locale, index, "long"))}</option>`)].join("");

    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .editor { display: grid; gap: 16px; padding: 4px 0; color: var(--primary-text-color); }
        .field { display: grid; gap: 6px; }
        .label { font-size: 13px; font-weight: 600; }
        input[type="text"], select { min-height: 40px; padding: 7px 10px; border: 1px solid var(--divider-color); border-radius: 8px; background: var(--card-background-color); color: inherit; font: inherit; }
        .entities { display: grid; gap: 2px; max-height: 240px; overflow: auto; padding: 5px 0; }
        .entity-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; padding: 4px 8px; border-radius: 8px; }
        .entity-row:hover { background: var(--secondary-background-color); }
        .entity-name { display: flex; align-items: center; gap: 9px; min-width: 0; font-size: 14px; }
        .entity-name span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--primary-color); }
        .swatch { width: 10px; height: 10px; flex: none; border-radius: 50%; background: var(--schedule-color); }
        .color { width: 38px; height: 32px; padding: 2px; border: 1px solid var(--divider-color); border-radius: 7px; background: transparent; }
        .hint { color: var(--secondary-text-color); font-size: 12px; }
        .toggle { display: flex; align-items: center; gap: 9px; font-size: 14px; }
      </style>
      <div class="editor">
        <div class="field"><span class="label">${escapeHtml(localize(locale, "entityHeading"))}</span>
          <div class="entities">${entityRows || `<span class="hint">${escapeHtml(localize(locale, "noEntities"))}</span>`}</div>
        </div>
        <label class="field"><span class="label">${escapeHtml(localize(locale, "titleLabel"))}</span><input type="text" data-option="title" value="${escapeHtml(this._config.title || "")}"></label>
        <label class="field"><span class="label">${escapeHtml(localize(locale, "view"))}</span><select data-option="view"><option value="week" ${this._config.view === "week" ? "selected" : ""}>${escapeHtml(localize(locale, "week"))}</option><option value="day" ${this._config.view === "day" ? "selected" : ""}>${escapeHtml(localize(locale, "day"))}</option></select></label>
        ${this._config.view === "day" ? `<label class="field"><span class="label">${escapeHtml(localize(locale, "whichDay"))}</span><select data-option="day">${dayOptions}</select></label>` : ""}
        <label class="toggle"><input type="checkbox" data-option="show_header" ${this._config.show_header ? "checked" : ""}>${escapeHtml(localize(locale, "showHeader"))}</label>
      </div>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const nextEntities = [...this.shadowRoot.querySelectorAll("[data-entity]:checked")].map((element) => element.dataset.entity);
        this._updateConfig({ entities: nextEntities });
      });
    });
    this.shadowRoot.querySelectorAll("[data-color-entity]").forEach((input) => {
      input.addEventListener("change", () => {
        const colors = { ...this._config.colors, [input.dataset.colorEntity]: input.value };
        this._updateConfig({ colors });
      });
    });
    this.shadowRoot.querySelectorAll("[data-option]").forEach((input) => {
      input.addEventListener("change", () => {
        const value = input.type === "checkbox" ? input.checked : input.value;
        this._updateConfig({ [input.dataset.option]: value });
      });
    });
  }
}

if (!customElements.get("schedule-card-editor")) {
  customElements.define("schedule-card-editor", ScheduleCardEditor);
}

if (!customElements.get("schedule-card")) {
  customElements.define("schedule-card", ScheduleCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "schedule-card",
  name: "Schedule Card",
  description: "Visualize and edit stored Home Assistant schedules.",
  preview: true,
});