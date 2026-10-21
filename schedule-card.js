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
  en: { title: "Schedules", add: "Add schedule", edit: "Edit", delete: "Delete", cancel: "Cancel", save: "Save", loading: "Loading schedules...", empty: "No stored schedules yet.", noTimes: "No times", choose: "Choose schedules in the card settings.", missing: "Selected schedules are not available.", confirm: 'Delete schedule "{name}"?', nameRequired: "Enter a name for this schedule.", timeRequired: "Each time range needs a start and end.", jsonInvalid: "Action data must be valid JSON.", jsonObject: "Action data must be a JSON object.", saveError: "Unable to save schedule.", deleteError: "Unable to delete schedule.", toggleError: "Unable to change the schedule state.", restartRequired: "Home Assistant must restart to enable this schedule entity.", pause: "Disable schedule", resume: "Enable schedule", openSchedule: "Open settings for {name}", view: "Display", week: "Whole week", day: "Single day", whichDay: "Day", today: "Today", titleLabel: "Title", showHeader: "Show header", showLegend: "Show legend", entityHeading: "Schedule entities", color: "Color", label: "Label", dragHelp: "Drag on a track to create a time. Drag a bar to move it; drag either edge to resize it.", noEntities: "No editable schedule entities found." },
  de: { title: "Zeitpläne", add: "Zeitplan hinzufügen", edit: "Bearbeiten", delete: "Löschen", cancel: "Abbrechen", save: "Speichern", loading: "Zeitpläne werden geladen...", empty: "Keine gespeicherten Zeitpläne.", noTimes: "Keine Zeiten", choose: "Wähle Zeitpläne in den Karteneinstellungen.", missing: "Ausgewählte Zeitpläne sind nicht verfügbar.", confirm: 'Zeitplan "{name}" löschen?', nameRequired: "Gib einen Namen für diesen Zeitplan ein.", timeRequired: "Jeder Zeitraum benötigt einen Start und ein Ende.", jsonInvalid: "Die Aktionsdaten müssen gültiges JSON sein.", jsonObject: "Die Aktionsdaten müssen ein JSON-Objekt sein.", saveError: "Zeitplan konnte nicht gespeichert werden.", deleteError: "Zeitplan konnte nicht gelöscht werden.", toggleError: "Der Zeitplanstatus konnte nicht geändert werden.", restartRequired: "Home Assistant muss neu gestartet werden, um diesen Zeitplan zu aktivieren.", pause: "Zeitplan deaktivieren", resume: "Zeitplan aktivieren", openSchedule: "Einstellungen für {name} öffnen", view: "Anzeige", week: "Ganze Woche", day: "Einzelner Tag", whichDay: "Wochentag", today: "Heute", titleLabel: "Titel", showHeader: "Kopfzeile anzeigen", showLegend: "Legende anzeigen", entityHeading: "Zeitplan-Entitäten", color: "Farbe", label: "Label", dragHelp: "Auf einer Zeile ziehen, um eine Zeit zu erstellen. Balken verschieben oder an den Enden ziehen, um sie anzupassen.", noEntities: "Keine bearbeitbaren Zeitplan-Entitäten gefunden." },
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
    return { entities: [], view: "week", day: "today", show_header: true, show_legend: true };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._items = [];
    this._loading = false;
    this._error = "";
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
      show_legend: true,
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
    const title = escapeHtml(this._config.title || localize(this._hass, "title"));
    const missing = (this._config.entities || []).some(
      (entityId) => !this._items.some((item) => `schedule.${item.id}` === entityId),
    );
    const message = this._loading
      ? `<div class="message">${escapeHtml(localize(this._hass, "loading"))}</div>`
      : missing
          ? `<div class="message">${escapeHtml(localize(this._hass, "missing"))}</div>`
          : items.length
            ? `${this._renderTimeline(items)}${this._config.show_legend ? this._renderLegend(items) : ""}`
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
        .legend-item:focus-visible { outline: 2px solid var(--primary-color, #c99bf2); outline-offset: 3px; }
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
        .range { position: absolute; top: 1px; height: 17px; min-width: 2px; overflow: hidden; padding: 1px 5px; border-radius: 4px; background: var(--schedule-color); color: var(--schedule-text-color, #241e2d); font-size: 11px; line-height: 15px; white-space: nowrap; }
        .range { cursor: pointer; }
        .empty { position: absolute; top: 2px; left: 4px; color: var(--secondary-text-color, #b8bed8); font-size: 10px; }
        .message { padding: 12px 0; color: var(--secondary-text-color, #b8bed8); }
        .error { color: var(--error-color, #b3261e); }
        @media (max-width: 520px) {
          .card { padding: 12px; }
        }
      </style>
      <section class="card">
        ${this._config.show_header ? `<header><h2>${title}</h2></header>` : ""}
        ${this._error ? `<div class="message error" role="alert">${escapeHtml(this._error)}</div>` : ""}
        ${message}
      </section>`;
    this.shadowRoot.onclick = (event) => this._handleScheduleClick(event);
    this.shadowRoot.onkeydown = (event) => this._handleScheduleKeydown(event);
    this._fitRangeLabels();
  }

  _renderLegend(items) {
    return `<div class="legend">${items.map((item, index) => {
      const entityId = `schedule.${item.id}`;
      const color = escapeHtml(this._colorFor(item, index));
      const label = this._labelFor(item);
      return `<div class="legend-item" style="--schedule-color:${color}" data-edit-entity="${escapeHtml(entityId)}" role="button" tabindex="0" aria-label="${escapeHtml(localize(this._hass, "openSchedule", { name: this._labelFor(item) }))}" title="${escapeHtml(localize(this._hass, "openSchedule", { name: this._labelFor(item) }))}">
        <span class="swatch"></span><span class="legend-name">${escapeHtml(label)}</span>
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
          const entityLabel = this._labelFor(item);
          const segments = ranges.map((range, rangeIndex) => {
            const start = minutes(range.from);
            const end = minutes(range.to);
            const left = (start / 1440) * 100;
            const width = ((end - start) / 1440) * 100;
            const label = `${formatTime(range.from)}-${formatTime(range.to)}`;
            return `<span class="range" data-entity="${escapeHtml(entityId)}" data-day="${day}" data-index="${rangeIndex}" data-label="${escapeHtml(label)}" aria-label="${escapeHtml(`${entityLabel}, ${label}`)}" style="--schedule-color:${color};left:${left}%;width:${width}%">${escapeHtml(label)}</span>`;
          }).join("");
          return `<div class="track" data-entity="${escapeHtml(entityId)}" data-day="${day}" style="--schedule-color:${color}" role="button" tabindex="0" aria-label="${escapeHtml(localize(this._hass, "openSchedule", { name: entityLabel }))}" title="${escapeHtml(localize(this._hass, "openSchedule", { name: entityLabel }))}">${segments}</div>`;
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

  _handleScheduleClick(event) {
    const target = event.target.closest("[data-edit-entity]") || event.target.closest(".track[data-entity]");
    if (target?.dataset.editEntity || target?.dataset.entity) {
      this._openScheduleSettings(target.dataset.editEntity || target.dataset.entity);
    }
  }

  _handleScheduleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-edit-entity], .track[data-entity]");
    if (!target) return;
    event.preventDefault();
    this._openScheduleSettings(target.dataset.editEntity);
  }

  _openScheduleSettings(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId, view: "settings" },
      bubbles: true,
      composed: true,
    }));
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