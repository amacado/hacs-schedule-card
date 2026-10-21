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
  en: { title: "Schedules", add: "Add schedule", edit: "Edit", delete: "Delete", cancel: "Cancel", save: "Save", loading: "Loading schedules...", empty: "No stored schedules yet.", noTimes: "No times", choose: "Choose schedules in the card settings.", missing: "Selected schedules are not available.", confirm: 'Delete schedule "{name}"?', nameRequired: "Enter a name for this schedule.", timeRequired: "Each time range needs a start and end.", jsonInvalid: "Action data must be valid JSON.", jsonObject: "Action data must be a JSON object.", saveError: "Unable to save schedule.", deleteError: "Unable to delete schedule.", toggleError: "Unable to change the schedule state.", restartRequired: "Home Assistant must restart to enable this schedule entity.", pause: "Disable schedule", resume: "Enable schedule", view: "Display", week: "Whole week", day: "Single day", whichDay: "Day", today: "Today", titleLabel: "Title", showHeader: "Show header", entityHeading: "Schedule entities", color: "Color", dragHelp: "Drag on a track to create a time. Drag a bar to move it; drag either edge to resize it.", noEntities: "No editable schedule entities found." },
  de: { title: "Zeitpläne", add: "Zeitplan hinzufügen", edit: "Bearbeiten", delete: "Löschen", cancel: "Abbrechen", save: "Speichern", loading: "Zeitpläne werden geladen...", empty: "Keine gespeicherten Zeitpläne.", noTimes: "Keine Zeiten", choose: "Wähle Zeitpläne in den Karteneinstellungen.", missing: "Ausgewählte Zeitpläne sind nicht verfügbar.", confirm: 'Zeitplan "{name}" löschen?', nameRequired: "Gib einen Namen für diesen Zeitplan ein.", timeRequired: "Jeder Zeitraum benötigt einen Start und ein Ende.", jsonInvalid: "Die Aktionsdaten müssen gültiges JSON sein.", jsonObject: "Die Aktionsdaten müssen ein JSON-Objekt sein.", saveError: "Zeitplan konnte nicht gespeichert werden.", deleteError: "Zeitplan konnte nicht gelöscht werden.", toggleError: "Der Zeitplanstatus konnte nicht geändert werden.", restartRequired: "Home Assistant muss neu gestartet werden, um diesen Zeitplan zu aktivieren.", pause: "Zeitplan deaktivieren", resume: "Zeitplan aktivieren", view: "Anzeige", week: "Ganze Woche", day: "Einzelner Tag", whichDay: "Wochentag", today: "Heute", titleLabel: "Titel", showHeader: "Kopfzeile anzeigen", entityHeading: "Zeitplan-Entitäten", color: "Farbe", dragHelp: "Auf einer Zeile ziehen, um eine Zeit zu erstellen. Balken verschieben oder an den Enden ziehen, um sie anzupassen.", noEntities: "Keine bearbeitbaren Zeitplan-Entitäten gefunden." },
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
    this._registry = [];
    this._loading = false;
    this._error = "";
    this._busy = false;
    this._drag = null;
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
      try {
        this._registry = await this._hass.callWS({ type: "config/entity_registry/list" });
      } catch (_error) {
        this._registry = [];
      }
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
      : missing
          ? `<div class="message">${escapeHtml(localize(this._hass, "missing"))}</div>`
          : items.length
            ? `${this._renderLegend(items)}${this._renderTimeline(items)}`
            : `<div class="message">${escapeHtml(this._config.entities?.length ? localize(this._hass, "missing") : localize(this._hass, "empty"))}</div>`;

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
        .range { cursor: grab; touch-action: none; }
        .range:active { cursor: grabbing; }
        .preview { position: absolute; top: 1px; height: 17px; border: 1px dashed var(--schedule-color); border-radius: 4px; background: color-mix(in srgb, var(--schedule-color) 45%, transparent); pointer-events: none; }
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
        ${this._config.show_header ? `<header><h2>${title}</h2></header>` : ""}
        ${this._error ? `<div class="message error" role="alert">${escapeHtml(this._error)}</div>` : ""}
        ${message}
      </section>`;
    this.shadowRoot.querySelectorAll("[data-toggle-entity]").forEach((toggle) => {
      toggle.addEventListener("change", () => this._toggleEntity(toggle.dataset.toggleEntity, toggle.checked));
    });
    this.shadowRoot.onpointerdown = (event) => this._onPointerDown(event);
    this.shadowRoot.onpointermove = (event) => this._onPointerMove(event);
    this.shadowRoot.onpointerup = (event) => this._onPointerUp(event);
    this.shadowRoot.onpointercancel = () => this._cancelDrag();
    this._fitRangeLabels();
  }

  _renderLegend(items) {
    return `<div class="legend">${items.map((item, index) => {
      const entityId = `schedule.${item.id}`;
      const color = escapeHtml(this._colorFor(item, index));
      const registryEntry = this._registry.find((entry) => entry.entity_id === entityId);
      const enabled = !registryEntry?.disabled_by;
      return `<div class="legend-item" style="--schedule-color:${color}">
        <span class="swatch"></span><span class="legend-name">${escapeHtml(item.name)}</span>
        <ha-switch data-toggle-entity="${escapeHtml(entityId)}" aria-label="${escapeHtml(localize(this._hass, enabled ? "pause" : "resume"))}: ${escapeHtml(item.name)}" title="${escapeHtml(localize(this._hass, enabled ? "pause" : "resume"))}" ${enabled ? "checked" : ""}></ha-switch>
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
          const entityId = `schedule.${item.id}`;
          const segments = ranges.map((range, rangeIndex) => {
            const start = minutes(range.from);
            const end = minutes(range.to);
            const left = (start / 1440) * 100;
            const width = ((end - start) / 1440) * 100;
            const label = `${formatTime(range.from)}-${formatTime(range.to)}`;
            return `<span class="range" data-entity="${escapeHtml(entityId)}" data-day="${day}" data-index="${rangeIndex}" data-label="${escapeHtml(label)}" aria-label="${escapeHtml(`${item.name}, ${label}`)}" style="--schedule-color:${color};left:${left}%;width:${width}%">${escapeHtml(label)}</span>`;
          }).join("");
          return `<div class="track" data-entity="${escapeHtml(entityId)}" data-day="${day}" style="--schedule-color:${color}">${segments}</div>`;
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

  _onPointerDown(event) {
    if (this._busy || event.button !== 0 || event.target.closest("ha-switch")) return;
    const rangeElement = event.target.closest(".range");
    const track = rangeElement?.parentElement || event.target.closest(".track[data-entity]");
    if (!track) return;
    const { entity: entityId, day } = track.dataset;
    const item = this._items.find((schedule) => `schedule.${schedule.id}` === entityId);
    if (!item) return;

    const trackRect = track.getBoundingClientRect();
    const minuteAtPointer = this._snapMinute(((event.clientX - trackRect.left) / trackRect.width) * 1440);
    let action = "create";
    let rangeIndex = -1;
    let start = minuteAtPointer;
    let end = minuteAtPointer;

    if (rangeElement) {
      rangeIndex = Number(rangeElement.dataset.index);
      const range = item[day][rangeIndex];
      start = minutes(range.from);
      end = minutes(range.to);
      const rect = rangeElement.getBoundingClientRect();
      const offset = event.clientX - rect.left;
      const edgeSize = Math.min(8, rect.width / 4);
      action = offset < edgeSize ? "resize-start" : offset > rect.width - edgeSize ? "resize-end" : "move";
    }

    this._drag = { entityId, day, action, rangeIndex, start, end, anchor: minuteAtPointer, track, trackRect, rangeElement, pointerId: event.pointerId };
    track.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  _snapMinute(value) {
    return Math.max(0, Math.min(1440, Math.round(value / 15) * 15));
  }

  _onPointerMove(event) {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pointer = this._snapMinute(((event.clientX - drag.trackRect.left) / drag.trackRect.width) * 1440);
    let start = drag.start;
    let end = drag.end;

    if (drag.action === "create") {
      start = Math.min(drag.anchor, pointer);
      end = Math.max(drag.anchor, pointer);
      if (end - start < 15) end = Math.min(1440, start + 15);
    } else if (drag.action === "move") {
      const delta = pointer - drag.anchor;
      const duration = drag.end - drag.start;
      start = Math.max(0, Math.min(1440 - duration, drag.start + delta));
      end = start + duration;
    } else if (drag.action === "resize-start") {
      start = Math.max(0, Math.min(drag.end - 15, pointer));
    } else if (drag.action === "resize-end") {
      end = Math.max(drag.start + 15, Math.min(1440, pointer));
    }

    drag.preview = { start, end };
    if (drag.rangeElement) {
      drag.rangeElement.style.left = `${(start / 1440) * 100}%`;
      drag.rangeElement.style.width = `${((end - start) / 1440) * 100}%`;
    } else {
      if (!drag.previewElement) {
        drag.previewElement = document.createElement("span");
        drag.previewElement.className = "preview";
        drag.track.append(drag.previewElement);
      }
      drag.previewElement.style.left = `${(start / 1440) * 100}%`;
      drag.previewElement.style.width = `${((end - start) / 1440) * 100}%`;
    }
  }

  async _onPointerUp(event) {
    const drag = this._drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this._drag = null;
    const item = this._items.find((schedule) => `schedule.${schedule.id}` === drag.entityId);
    if (!item) return this._render();

    let start = drag.preview?.start ?? drag.start;
    let end = drag.preview?.end ?? drag.end;
    if (drag.action === "create" && end - start < 15) {
      start = Math.min(1380, start);
      end = Math.min(1440, start + 60);
    }
    const ranges = [...(item[drag.day] || [])].map((range) => ({ ...range }));
    const timeRange = { from: this._timeValue(start), to: this._timeValue(end) };
    if (drag.action === "create") ranges.push(timeRange);
    else ranges[drag.rangeIndex] = { ...ranges[drag.rangeIndex], ...timeRange };
    ranges.sort((first, second) => first.from.localeCompare(second.from));
    await this._saveRange(item, drag.day, ranges);
  }

  _timeValue(value) {
    if (value >= 1440) return "24:00:00";
    const hours = Math.floor(value / 60).toString().padStart(2, "0");
    const minutesValue = (value % 60).toString().padStart(2, "0");
    return `${hours}:${minutesValue}:00`;
  }

  _cancelDrag() {
    if (!this._drag) return;
    this._drag = null;
    this._render();
  }

  async _saveRange(item, day, ranges) {
    const payload = { name: item.name, ...(item.icon ? { icon: item.icon } : {}) };
    for (const [weekday] of DAYS) {
      payload[weekday] = weekday === day ? ranges : (item[weekday] || []).map((range) => ({ ...range }));
    }
    this._busy = true;
    this._error = "";
    this._render();
    try {
      const saved = await this._hass.callWS({
        type: "schedule/update",
        schedule_id: item.id,
        ...payload,
      });
      const index = this._items.findIndex((schedule) => schedule.id === item.id);
      if (index !== -1) this._items[index] = saved;
    } catch (error) {
      this._error = error.message || localize(this._hass, "saveError");
    } finally {
      this._busy = false;
      this._render();
    }
  }

  async _toggleEntity(entityId, enabled) {
    this._error = "";
    try {
      const result = await this._hass.callWS({
        type: "config/entity_registry/update",
        entity_id: entityId,
        disabled_by: enabled ? null : "user",
      });
      const index = this._registry.findIndex((entry) => entry.entity_id === entityId);
      if (index !== -1) this._registry[index] = result.entity_entry;
      if (result.require_restart) this._error = localize(this._hass, "restartRequired");
      this._render();
    } catch (error) {
      this._error = error.message || localize(this._hass, "toggleError");
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
    const availableEntities = [...new Set([...entities.map((state) => state.entity_id), ...selected])];
    const selectedColors = selected.map((entityId, index) => {
      const name = this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
      const color = this._config.colors?.[entityId] || COLORS[index % COLORS.length];
      return `<label class="color-row"><span>${escapeHtml(name)}</span><input class="color" type="color" data-color-entity="${escapeHtml(entityId)}" value="${escapeHtml(color)}" aria-label="${escapeHtml(localize(locale, "color"))}: ${escapeHtml(name)}" title="${escapeHtml(localize(locale, "color"))}: ${escapeHtml(name)}"></label>`;
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
        .color-list { display: grid; gap: 6px; }
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
        ${selected.length ? `<div class="field"><span class="label">${escapeHtml(localize(locale, "color"))}</span><div class="color-list">${selectedColors}</div></div>` : ""}
        <label class="field"><span class="label">${escapeHtml(localize(locale, "titleLabel"))}</span><input type="text" data-option="title" value="${escapeHtml(this._config.title || "")}"></label>
        <label class="field"><span class="label">${escapeHtml(localize(locale, "view"))}</span><select data-option="view"><option value="week" ${this._config.view === "week" ? "selected" : ""}>${escapeHtml(localize(locale, "week"))}</option><option value="day" ${this._config.view === "day" ? "selected" : ""}>${escapeHtml(localize(locale, "day"))}</option></select></label>
        ${this._config.view === "day" ? `<label class="field"><span class="label">${escapeHtml(localize(locale, "whichDay"))}</span><select data-option="day">${dayOptions}</select></label>` : ""}
        <label class="toggle"><ha-switch data-option="show_header" ${this._config.show_header ? "checked" : ""}></ha-switch>${escapeHtml(localize(locale, "showHeader"))}</label>
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