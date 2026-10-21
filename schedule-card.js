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
  en: { title: "Schedules", add: "Add schedule", edit: "Edit", delete: "Delete", cancel: "Cancel", save: "Save", loading: "Loading schedules...", empty: "No stored schedules yet.", noTimes: "No times", choose: "Choose schedules in the card settings.", missing: "Selected schedules are not available.", confirm: 'Delete schedule "{name}"?', nameRequired: "Enter a name for this schedule.", timeRequired: "Each time range needs a start and end.", jsonInvalid: "Action data must be valid JSON.", jsonObject: "Action data must be a JSON object.", saveError: "Unable to save schedule.", deleteError: "Unable to delete schedule.", toggleError: "Unable to change the schedule state.", restartRequired: "Home Assistant must restart to enable this schedule entity.", pause: "Disable schedule", resume: "Enable schedule", selectSchedule: "Select {name} to edit", editingSchedule: "Editing schedule", openSchedule: "Open settings for {name}", removeRange: "Remove time range", enableEditing: "Enable editing", view: "Display", week: "Whole week", day: "Single day", whichDay: "Day", today: "Today", titleLabel: "Title", showHeader: "Show header", showLegend: "Show legend", entityHeading: "Schedule entities", color: "Color", label: "Label", dragHelp: "Drag on a track to create a time. Drag a bar to move it; drag either edge to resize it.", noEntities: "No editable schedule entities found." },
  de: { title: "Zeitpläne", add: "Zeitplan hinzufügen", edit: "Bearbeiten", delete: "Löschen", cancel: "Abbrechen", save: "Speichern", loading: "Zeitpläne werden geladen...", empty: "Keine gespeicherten Zeitpläne.", noTimes: "Keine Zeiten", choose: "Wähle Zeitpläne in den Karteneinstellungen.", missing: "Ausgewählte Zeitpläne sind nicht verfügbar.", confirm: 'Zeitplan "{name}" löschen?', nameRequired: "Gib einen Namen für diesen Zeitplan ein.", timeRequired: "Jeder Zeitraum benötigt einen Start und ein Ende.", jsonInvalid: "Die Aktionsdaten müssen gültiges JSON sein.", jsonObject: "Die Aktionsdaten müssen ein JSON-Objekt sein.", saveError: "Zeitplan konnte nicht gespeichert werden.", deleteError: "Zeitplan konnte nicht gelöscht werden.", toggleError: "Der Zeitplanstatus konnte nicht geändert werden.", restartRequired: "Home Assistant muss neu gestartet werden, um diesen Zeitplan zu aktivieren.", pause: "Zeitplan deaktivieren", resume: "Zeitplan aktivieren", selectSchedule: "{name} zum Bearbeiten auswählen", editingSchedule: "Zeitplan bearbeiten", openSchedule: "Einstellungen für {name} öffnen", removeRange: "Zeitraum entfernen", enableEditing: "Bearbeitung aktivieren", view: "Anzeige", week: "Ganze Woche", day: "Einzelner Tag", whichDay: "Wochentag", today: "Heute", titleLabel: "Titel", showHeader: "Kopfzeile anzeigen", showLegend: "Legende anzeigen", entityHeading: "Zeitplan-Entitäten", color: "Farbe", label: "Label", dragHelp: "Auf einer Zeile ziehen, um eine Zeit zu erstellen. Balken verschieben oder an den Enden ziehen, um sie anzupassen.", noEntities: "Keine bearbeitbaren Zeitplan-Entitäten gefunden." },
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
    return { entities: [], view: "week", day: "today", show_header: true, show_legend: true, edit_enabled: true };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
    this._loading = false;
    this._error = "";
    this._activeScheduleId = null;
    this._selectedRange = null;
    this._drag = null;
    this._busy = false;
    this._subscription = null;
    this._measureCanvas = document.createElement("canvas");
    this._measureContext = this._measureCanvas.getContext("2d");
    this._labelObserver = new ResizeObserver(() => this._fitRangeLabels());
    this.shadowRoot.addEventListener("pointerdown", (event) => this._onEditStart(event));
    this.shadowRoot.addEventListener("click", (event) => this._handleScheduleClick(event));
    this.shadowRoot.addEventListener("keydown", (event) => this._handleScheduleKeydown(event));
    this.shadowRoot.addEventListener("change", (event) => {
      if (event.target.matches("[data-edit-target]")) {
        this._setActiveSchedule(event.target.value);
      }
    });
  }

  connectedCallback() {
    this._labelObserver.observe(this);
  }

  disconnectedCallback() {
    this._labelObserver.disconnect();
    this._subscription?.();
    this._removeEditListeners();
  }

  setConfig(config) {
    this._config = {
      view: "week",
      day: "today",
      show_header: true,
      show_legend: true,
      edit_enabled: config.edit_enabled !== undefined ? config.edit_enabled : true,
      ...config,
      entities: config.entities || (config.entity ? [config.entity] : []),
    };
    this._render();
  }

  set hass(hass) {
    const localeChanged = this._hass?.language !== hass?.language;
    this._hass = hass;
    if (!this._loaded && !this._loading) this._load();
    else if (localeChanged) this._render();
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

  _labelFor(item) {
    const entityId = `schedule.${item.id}`;
    return this._config.labels?.[entityId]?.trim() || item.name;
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
    if (!items.some((item) => item.id === this._activeScheduleId)) {
      this._activeScheduleId = items[0]?.id || null;
    }
    const title = escapeHtml(this._config.title || localize(this._hass, "title"));
    const missing = (this._config.entities || []).some(
      (entityId) => !this._items.some((item) => `schedule.${item.id}` === entityId),
    );
    const message = this._loading
      ? `<div class="message">${escapeHtml(localize(this._hass, "loading"))}</div>`
      : missing
          ? `<div class="message">${escapeHtml(localize(this._hass, "missing"))}</div>`
          : items.length
            ? `${this._config.edit_enabled && items.length > 1 ? this._renderEditTarget(items) : ""}${this._renderSelectedRangeTools()}${this._renderTimeline(items)}${this._config.show_legend ? this._renderLegend(items) : ""}`
            : `<div class="message">${escapeHtml(this._config.entities?.length ? localize(this._hass, "missing") : localize(this._hass, "empty"))}</div>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; color: var(--primary-text-color, #d6d9ef); }
        * { box-sizing: border-box; }
        .card { padding: 16px 20px; border: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); border-radius: var(--bubble-border-radius, 14px); background: var(--bubble-main-background-color, var(--ha-card-background, var(--card-background-color, #252739))); }
        header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); }
        h2 { margin: 0; font-size: 18px; font-weight: 650; }
        .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 2px 0 12px; }
        .legend-item { display: flex; align-items: center; gap: 6px; min-width: 0; cursor: pointer; }
        .legend-item.selected { color: var(--primary-color, #c99bf2); }
        .legend-item:focus-visible { outline: 2px solid var(--primary-color, #c99bf2); outline-offset: 3px; }
        .edit-target { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 0 0 10px; font-size: 12px; }
        .edit-target select { max-width: 240px; min-height: 34px; padding: 4px 8px; border: 1px solid var(--bubble-border-color, var(--divider-color, #36394f)); border-radius: 7px; background: var(--card-background-color, #252739); color: inherit; font: inherit; }
        .selection-tools { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 36px; margin: 0 0 8px; color: var(--secondary-text-color, #b8bed8); font-size: 12px; }
        .selection-tools ha-icon-button { --mdc-icon-button-size: 34px; color: var(--error-color, #ef7888); }
        .selection-tools ha-icon { --mdc-icon-size: 20px; }
        .swatch { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--schedule-color); }
        .legend-name { overflow: hidden; max-width: 180px; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .timeline { min-width: 420px; }
        .scroll { overflow-x: auto; }
        .axis, .day-row { display: grid; grid-template-columns: 40px minmax(360px, 1fr); gap: 8px; }
        .axis { margin-bottom: 4px; color: var(--secondary-text-color, #b8bed8); font-size: 11px; }
        .hours { display: flex; justify-content: space-between; padding: 0 1px; }
        .day-row { min-height: 28px; align-items: center; }
        .day-name { color: var(--secondary-text-color, #b8bed8); font-size: 12px; }
        .tracks { display: grid; gap: 3px; }
        .track { position: relative; height: 19px; border-radius: 4px; background: repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--bubble-border-color, var(--divider-color, #36394f)) calc(25% - 1px), var(--bubble-border-color, var(--divider-color, #36394f)) 25%); cursor: pointer; }
        .track:focus-visible { outline: 2px solid var(--primary-color, #c99bf2); outline-offset: 2px; }
        .range { position: absolute; top: 1px; height: 17px; min-width: 8px; overflow: visible; padding: 1px 5px; border-radius: 4px; background: var(--schedule-color); color: var(--schedule-text-color, #241e2d); font-size: 11px; line-height: 15px; white-space: nowrap; cursor: grab; touch-action: none; }
        .range.selected { z-index: 2; outline: 2px solid var(--primary-color, #c99bf2); outline-offset: 2px; }
        .resize-handle { position: absolute; top: 0; z-index: 1; width: 10px; height: 100%; cursor: ew-resize; }
        .resize-handle.start { left: 0; }
        .resize-handle.end { right: 0; }
        .resize-handle::after { position: absolute; top: 3px; bottom: 3px; left: 4px; width: 2px; border-radius: 2px; background: transparent; content: ""; }
        .range:hover .resize-handle::after, .range.selected .resize-handle::after { background: rgb(36 30 45 / 70%); }
        .preview { z-index: 3; border: 1px dashed var(--schedule-color); background: color-mix(in srgb, var(--schedule-color) 55%, transparent); pointer-events: none; }
        .track.inactive { opacity: .58; }
        .track.active { opacity: 1; }
        .readonly .track, .readonly .range { cursor: default; }
        .empty { position: absolute; top: 2px; left: 4px; color: var(--secondary-text-color, #b8bed8); font-size: 10px; }
        .message { padding: 12px 0; color: var(--secondary-text-color, #b8bed8); }
        .error { color: var(--error-color, #b3261e); }
        @media (max-width: 520px) {
          .card { padding: 12px; }
        }
      </style>
      <section class="card ${this._config.edit_enabled ? "editable" : "readonly"}">
        ${this._config.show_header ? `<header><h2>${title}</h2></header>` : ""}
        ${this._error ? `<div class="message error" role="alert">${escapeHtml(this._error)}</div>` : ""}
        ${message}
      </section>`;
    this._fitRangeLabels();
  }

  _renderLegend(items) {
    return `<div class="legend">${items.map((item, index) => {
      const entityId = `schedule.${item.id}`;
      const color = escapeHtml(this._colorFor(item, index));
      const label = this._labelFor(item);
      return `<div class="legend-item ${item.id === this._activeScheduleId ? "selected" : ""}" style="--schedule-color:${color}" data-edit-entity="${escapeHtml(entityId)}" role="button" tabindex="0" aria-pressed="${item.id === this._activeScheduleId}" aria-label="${escapeHtml(localize(this._hass, "selectSchedule", { name: this._labelFor(item) }))}" title="${escapeHtml(localize(this._hass, "selectSchedule", { name: this._labelFor(item) }))}">
        <span class="swatch"></span><span class="legend-name">${escapeHtml(label)}</span>
      </div>`;
    }).join("")}</div>`;
  }

  _renderEditTarget(items) {
    return `<label class="edit-target"><span>${escapeHtml(localize(this._hass, "editingSchedule"))}</span><select data-edit-target>${items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === this._activeScheduleId ? "selected" : ""}>${escapeHtml(this._labelFor(item))}</option>`).join("")}</select></label>`;
  }

  _renderSelectedRangeTools() {
    const selected = this._selectedRange;
    if (!this._config.edit_enabled || !selected) return "";
    const item = this._items.find((schedule) => schedule.id === selected.id);
    const dayIndex = DAYS.findIndex(([day]) => day === selected.day);
    if (!item || dayIndex < 0) return "";
    const ranges = [...(item[selected.day] || [])].sort((first, second) => first.from.localeCompare(second.from));
    const range = ranges[selected.index];
    if (!range) return "";
    const description = `${this._labelFor(item)}, ${dayLabel(this._hass, dayIndex)}, ${formatTime(range.from)}-${formatTime(range.to)}`;
    const removeLabel = localize(this._hass, "removeRange");
    return `<div class="selection-tools"><span>${escapeHtml(description)}</span><ha-icon-button data-remove-range aria-label="${escapeHtml(removeLabel)}: ${escapeHtml(description)}" title="${escapeHtml(removeLabel)}"><ha-icon icon="mdi:delete-outline"></ha-icon></ha-icon-button></div>`;
  }

  _renderTimeline(items) {
    return `<div class="scroll"><div class="timeline">
      <div class="axis"><span></span><div class="hours"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
      ${this._visibleDays().map(([day, dayIndex]) => {
        const tracks = items.map((item, itemIndex) => {
          const ranges = [...(item[day] || [])].sort((a, b) => a.from.localeCompare(b.from));
          const color = escapeHtml(this._colorFor(item, itemIndex));
          const entityId = `schedule.${item.id}`;
          const entityLabel = this._labelFor(item);
          const segments = ranges.map((range, rangeIndex) => {
            const start = minutes(range.from);
            const end = minutes(range.to);
            const left = (start / 1440) * 100;
            const width = ((end - start) / 1440) * 100;
            const label = `${formatTime(range.from)}-${formatTime(range.to)}`;
            const selected = this._selectedRange?.id === item.id && this._selectedRange.day === day && this._selectedRange.index === rangeIndex;
            return `<span class="range ${selected ? "selected" : ""}" data-entity="${escapeHtml(entityId)}" data-day="${day}" data-index="${rangeIndex}" data-label="${escapeHtml(label)}" role="button" tabindex="0" aria-label="${escapeHtml(`${entityLabel}, ${label}`)}" style="--schedule-color:${color};left:${left}%;width:${width}%"><span class="resize-handle start" data-edge="start"></span><span class="range-label">${escapeHtml(label)}</span><span class="resize-handle end" data-edge="end"></span></span>`;
          }).join("");
          const active = item.id === this._activeScheduleId;
          return `<div class="track ${active ? "active" : "inactive"}" data-entity="${escapeHtml(entityId)}" data-day="${day}" style="--schedule-color:${color}" role="button" tabindex="0" aria-label="${escapeHtml(localize(this._hass, "selectSchedule", { name: entityLabel }))}" title="${escapeHtml(localize(this._hass, "selectSchedule", { name: entityLabel }))}">${segments}</div>`;
        }).join("");
        return `<div class="day-row"><span class="day-name">${escapeHtml(dayLabel(this._hass, dayIndex))}</span><div class="tracks">${tracks}</div></div>`;
      }).join("")}
    </div></div>`;
  }

  _fitRangeLabels() {
    const context = this._measureContext;
    this.shadowRoot?.querySelectorAll(".range[data-label]").forEach((range) => {
      const label = range.dataset.label;
      const style = window.getComputedStyle(range);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      if (context) context.font = style.font;
      const labelWidth = context ? context.measureText(label).width : label.length * 7;
      const fits = labelWidth <= range.clientWidth - padding - 20;
      const labelNode = range.querySelector(".range-label");
      if (labelNode) labelNode.textContent = fits ? label : "";
      if (fits) range.removeAttribute("title");
      else range.title = label;
    });
  }

  _handleScheduleClick(event) {
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }
    if (event.target.closest("select")) return;
    if (event.target.closest("[data-remove-range]")) {
      this._removeSelectedRange();
      return;
    }
    const legendEntry = event.target.closest("[data-edit-entity]");
    if (legendEntry) {
      this._setActiveSchedule(legendEntry.dataset.editEntity);
      return;
    }
    if (event.target.closest("[data-edit-target]")) return;
    if (!this._config.edit_enabled) return;
    const range = event.target.closest(".range[data-entity]");
    if (range) {
      const scheduleId = range.dataset.entity.slice("schedule.".length);
      if (scheduleId !== this._activeScheduleId) {
        this._setActiveSchedule(scheduleId);
        return;
      }
      this._selectedRange = { id: scheduleId, day: range.dataset.day, index: Number(range.dataset.index) };
      this._render();
      return;
    }
    const track = event.target.closest(".track[data-entity]");
    if (!track) return;
    const scheduleId = track.dataset.entity.slice("schedule.".length);
    if (scheduleId !== this._activeScheduleId) {
      this._setActiveSchedule(scheduleId);
      return;
    }
    const item = this._items.find((schedule) => schedule.id === scheduleId);
    const rect = track.getBoundingClientRect();
    if (!item || !rect.width) return;
    const start = Math.min(1380, this._minuteAt(event.clientX, rect));
    const day = track.dataset.day;
    const ranges = [...(item[day] || []), {
      from: this._timeValue(start),
      to: this._timeValue(start + 60),
    }].sort((first, second) => first.from.localeCompare(second.from));
    this._selectedRange = { id: scheduleId, day, index: ranges.findIndex((range) => range.from === this._timeValue(start)) };
    this._saveSchedule(item, day, ranges);
  }

  async _handleScheduleKeydown(event) {
    if (!this._config.edit_enabled) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const range = event.target.closest(".range[data-entity]");
    if (range) {
      event.preventDefault();
      this._selectedRange = {
        id: range.dataset.entity.slice("schedule.".length),
        day: range.dataset.day,
        index: Number(range.dataset.index),
      };
      this._render();
      return;
    }
    const track = event.target.closest(".track[data-entity]");
    if (!track) return;
    event.preventDefault();
    const id = track.dataset.entity.slice("schedule.".length);
    if (id !== this._activeScheduleId) {
      this._setActiveSchedule(id);
      return;
    }
    const item = this._items.find((schedule) => schedule.id === id);
    if (!item) return;
    const day = track.dataset.day;
    const ranges = [...(item[day] || []), { from: "09:00:00", to: "10:00:00" }]
      .sort((first, second) => first.from.localeCompare(second.from));
    this._selectedRange = { id, day, index: ranges.findIndex((value) => value.from === "09:00:00" && value.to === "10:00:00") };
    await this._saveSchedule(item, day, ranges);
  }

  _setActiveSchedule(entityId) {
    const id = entityId.startsWith("schedule.") ? entityId.slice("schedule.".length) : entityId;
    if (this._activeScheduleId === id) return;
    this._activeScheduleId = id;
    this._selectedRange = null;
    this._render();
  }

  _eventClientX(event) {
    return event.changedTouches?.[0]?.clientX ?? event.touches?.[0]?.clientX ?? event.clientX;
  }

  _minuteAt(clientX, rect) {
    return Math.max(0, Math.min(1440, Math.round((((clientX - rect.left) / rect.width) * 1440) / 15) * 15));
  }

  _onEditStart(event) {
    if (!this._config.edit_enabled || this._busy || event.button !== 0) return;
    const rangeElement = event.target.closest(".range[data-entity]");
    const track = rangeElement?.parentElement || event.target.closest(".track[data-entity]");
    if (!track) return;

    const entityId = track.dataset.entity;
    const scheduleId = entityId.slice("schedule.".length);
    if (scheduleId !== this._activeScheduleId) {
      this._setActiveSchedule(scheduleId);
      return;
    }

    const item = this._items.find((schedule) => schedule.id === scheduleId);
    const trackRect = track.getBoundingClientRect();
    if (!item || !trackRect.width) return;
    const clientX = this._eventClientX(event);
    const anchor = this._minuteAt(clientX, trackRect);
    const day = track.dataset.day;
    const ranges = [...(item[day] || [])].sort((first, second) => first.from.localeCompare(second.from));
    const rangeIndex = rangeElement ? Number(rangeElement.dataset.index) : -1;
    const range = rangeIndex >= 0 ? ranges[rangeIndex] : undefined;
    const edge = event.target.closest("[data-edge]")?.dataset.edge;
    const action = !range ? "create" : edge === "start" ? "resize-start" : edge === "end" ? "resize-end" : "move";
    const start = range ? minutes(range.from) : anchor;
    const end = range ? minutes(range.to) : anchor;

    this._drag = {
      item,
      day,
      action,
      rangeIndex,
      ranges,
      anchor,
      start,
      end,
      clientX,
      lastX: clientX,
      track,
      trackRect,
      rangeElement,
      pointerId: event.pointerId,
      moved: false,
    };
    this._dragMove = (moveEvent) => this._onEditMove(moveEvent);
    this._dragEnd = (endEvent) => this._onEditEnd(endEvent);
    this._dragCancel = () => this._cancelEditGesture();
    window.addEventListener("pointermove", this._dragMove);
    window.addEventListener("pointerup", this._dragEnd);
    window.addEventListener("pointercancel", this._dragCancel);
    window.addEventListener("blur", this._dragCancel);
    event.preventDefault();
  }

  _onEditMove(event) {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const clientX = this._eventClientX(event);
    drag.lastX = clientX;
    drag.moved ||= Math.abs(clientX - drag.clientX) > 2;
    if (!drag.moved) return;

    const pointer = this._minuteAt(clientX, drag.trackRect);
    let start = drag.start;
    let end = drag.end;
    const previousEnd = drag.ranges[drag.rangeIndex - 1]
      ? minutes(drag.ranges[drag.rangeIndex - 1].to)
      : 0;
    const nextStart = drag.ranges[drag.rangeIndex + 1]
      ? minutes(drag.ranges[drag.rangeIndex + 1].from)
      : 1440;

    if (drag.action === "create") {
      start = Math.min(drag.anchor, pointer);
      end = Math.max(drag.anchor, pointer);
      if (end - start < 15) end = Math.min(1440, start + 15);
    } else if (drag.action === "move") {
      const duration = drag.end - drag.start;
      const delta = pointer - drag.anchor;
      start = Math.max(previousEnd, Math.min(nextStart - duration, drag.start + delta));
      end = start + duration;
    } else if (drag.action === "resize-start") {
      start = Math.max(previousEnd, Math.min(drag.end - 15, pointer));
    } else {
      end = Math.max(drag.start + 15, Math.min(nextStart, pointer));
    }

    drag.preview = { start, end };
    if (drag.rangeElement) {
      drag.rangeElement.style.left = `${(start / 1440) * 100}%`;
      drag.rangeElement.style.width = `${((end - start) / 1440) * 100}%`;
    } else {
      if (!drag.previewElement) {
        drag.previewElement = document.createElement("span");
        drag.previewElement.className = "range preview";
        drag.track.append(drag.previewElement);
      }
      drag.previewElement.style.left = `${(start / 1440) * 100}%`;
      drag.previewElement.style.width = `${((end - start) / 1440) * 100}%`;
    }
  }

  async _onEditEnd(event) {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId || event.type !== "pointerup") return;
    this._removeEditListeners();
    this._drag = null;
    this._suppressNextClick = true;
    window.setTimeout(() => { this._suppressNextClick = false; }, 0);

    if (drag.action !== "create" && !drag.moved) {
      this._selectedRange = { id: drag.item.id, day: drag.day, index: drag.rangeIndex };
      this._render();
      return;
    }

    let start = drag.preview?.start ?? drag.start;
    let end = drag.preview?.end ?? drag.end;
    if (drag.action === "create" && (!drag.moved || end - start < 15)) {
      start = Math.min(1380, this._minuteAt(drag.lastX, drag.trackRect));
      end = start + 60;
    }
    const ranges = drag.ranges.map((range) => ({ ...range }));
    const editedRange = {
      ...(drag.rangeIndex >= 0 ? ranges[drag.rangeIndex] : {}),
      from: this._timeValue(start),
      to: this._timeValue(end),
    };
    if (drag.action === "create") ranges.push(editedRange);
    else ranges[drag.rangeIndex] = editedRange;
    ranges.sort((first, second) => first.from.localeCompare(second.from));
    this._selectedRange = {
      id: drag.item.id,
      day: drag.day,
      index: ranges.indexOf(editedRange),
    };
    await this._saveSchedule(drag.item, drag.day, ranges);
  }

  _timeValue(value) {
    if (value >= 1440) return "24:00:00";
    const hour = Math.floor(value / 60).toString().padStart(2, "0");
    const minute = (value % 60).toString().padStart(2, "0");
    return `${hour}:${minute}:00`;
  }

  _cancelEditGesture() {
    if (!this._drag) return;
    this._removeEditListeners();
    this._drag = null;
    this._render();
  }

  _removeEditListeners() {
    window.removeEventListener("pointermove", this._dragMove);
    window.removeEventListener("pointerup", this._dragEnd);
    window.removeEventListener("pointercancel", this._dragCancel);
    window.removeEventListener("blur", this._dragCancel);
  }

  async _saveSchedule(item, day, ranges) {
    if (!this._config.edit_enabled || this._busy) return false;
    const payload = { name: item.name, ...(item.icon ? { icon: item.icon } : {}) };
    for (const [weekday] of DAYS) {
      payload[weekday] = weekday === day ? ranges : (item[weekday] || []).map((range) => ({ ...range }));
    }
    this._busy = true;
    this._error = "";
    this._render();
    try {
      const saved = await this._hass.callWS({ type: "schedule/update", schedule_id: item.id, ...payload });
      const index = this._items.findIndex((schedule) => schedule.id === item.id);
      if (index !== -1) this._items[index] = saved;
      return true;
    } catch (error) {
      this._error = error.message || localize(this._hass, "saveError");
      return false;
    } finally {
      this._busy = false;
      this._render();
    }
  }

  async _removeSelectedRange() {
    if (!this._config.edit_enabled || this._busy || !this._selectedRange) return;
    const { id, day, index } = this._selectedRange;
    const item = this._items.find((schedule) => schedule.id === id);
    if (!item) return;
    const ranges = [...(item[day] || [])].sort((first, second) => first.from.localeCompare(second.from));
    if (index < 0 || index >= ranges.length) return;
    ranges.splice(index, 1);
    const removed = await this._saveSchedule(item, day, ranges);
    if (removed) this._selectedRange = null;
    this._render();
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
      show_legend: true,
      edit_enabled: config.edit_enabled !== undefined ? config.edit_enabled : true,
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
    const availableEntities = [...new Set([...entities.map((state) => state.entity_id), ...selected])];
    const selectedSettings = selected.map((entityId, index) => {
      const name = this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
      const color = this._config.colors?.[entityId] || COLORS[index % COLORS.length];
      const label = this._config.labels?.[entityId] || "";
      return `<div class="entity-settings">
        <label class="field"><span>${escapeHtml(localize(locale, "label"))}: ${escapeHtml(name)}</span><input type="text" data-label-entity="${escapeHtml(entityId)}" value="${escapeHtml(label)}" placeholder="${escapeHtml(name)}"></label>
        <label class="color-row"><span>${escapeHtml(localize(locale, "color"))}</span><input class="color" type="color" data-color-entity="${escapeHtml(entityId)}" value="${escapeHtml(color)}" aria-label="${escapeHtml(localize(locale, "color"))}: ${escapeHtml(name)}" title="${escapeHtml(localize(locale, "color"))}: ${escapeHtml(name)}"></label>
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
        .entity-picker { display: block; }
        .color-list { display: grid; gap: 12px; }
        .entity-settings { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
        .entity-settings .field { gap: 4px; color: var(--secondary-text-color); font-size: 12px; }
        .entity-settings .field input { color: var(--primary-text-color); font-size: 14px; }
        .color-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
        .color-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .color { width: 38px; height: 32px; padding: 2px; border: 1px solid var(--divider-color); border-radius: 7px; background: transparent; }
        .toggle { display: flex; align-items: center; gap: 9px; font-size: 14px; }
        .hint { color: var(--secondary-text-color); font-size: 12px; }
      </style>
      <div class="editor">
        <div class="field"><span class="label">${escapeHtml(localize(locale, "entityHeading"))}</span>
          <div class="entity-picker"></div>
        </div>
        ${selected.length ? `<div class="field"><span class="label">${escapeHtml(localize(locale, "entityHeading"))}</span><div class="color-list">${selectedSettings}</div></div>` : ""}
        <label class="field"><span class="label">${escapeHtml(localize(locale, "titleLabel"))}</span><input type="text" data-option="title" value="${escapeHtml(this._config.title || "")}"></label>
        <label class="field"><span class="label">${escapeHtml(localize(locale, "view"))}</span><select data-option="view"><option value="week" ${this._config.view === "week" ? "selected" : ""}>${escapeHtml(localize(locale, "week"))}</option><option value="day" ${this._config.view === "day" ? "selected" : ""}>${escapeHtml(localize(locale, "day"))}</option></select></label>
        ${this._config.view === "day" ? `<label class="field"><span class="label">${escapeHtml(localize(locale, "whichDay"))}</span><select data-option="day">${dayOptions}</select></label>` : ""}
        <label class="toggle"><ha-switch data-option="show_header" ${this._config.show_header ? "checked" : ""}></ha-switch>${escapeHtml(localize(locale, "showHeader"))}</label>
        <label class="toggle"><ha-switch data-option="show_legend" ${this._config.show_legend ? "checked" : ""}></ha-switch>${escapeHtml(localize(locale, "showLegend"))}</label>
        <label class="toggle"><ha-switch data-option="edit_enabled" ${this._config.edit_enabled ? "checked" : ""}></ha-switch>${escapeHtml(localize(locale, "enableEditing"))}</label>
      </div>`;

    const selector = document.createElement("ha-selector");
    selector.hass = this._hass;
    selector.selector = { entity: { multiple: true, include_entities: availableEntities } };
    selector.value = selected;
    selector.required = false;
    selector.addEventListener("value-changed", (event) => {
      this._updateConfig({ entities: Array.isArray(event.detail.value) ? event.detail.value : [] });
    });
    this.shadowRoot.querySelector(".entity-picker").append(selector);
    this.shadowRoot.querySelectorAll("[data-color-entity]").forEach((input) => {
      input.addEventListener("change", () => {
        const colors = { ...this._config.colors, [input.dataset.colorEntity]: input.value };
        this._updateConfig({ colors });
      });
    });
    this.shadowRoot.querySelectorAll("[data-label-entity]").forEach((input) => {
      input.addEventListener("change", () => {
        const labels = { ...this._config.labels, [input.dataset.labelEntity]: input.value.trim() };
        this._updateConfig({ labels });
      });
    });
    this.shadowRoot.querySelectorAll("[data-option]").forEach((input) => {
      input.addEventListener("change", () => {
        const value = input.tagName === "HA-SWITCH" ? input.checked : input.value;
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