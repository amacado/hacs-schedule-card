# Schedule Card

A Lovelace card for visualizing and editing schedules stored by Home Assistant's built-in [Schedule integration](https://www.home-assistant.io/integrations/schedule/). Drag a bar to move it, drag either edge to resize it, or drag across an empty lane to create a time range. Changes are saved automatically and Home Assistant reports invalid or overlapping ranges in the card.

The card manages schedules created in the integration's storage collection. YAML-defined schedules are not returned by the integration's storage API and cannot be edited by this card.

## Install with HACS

1. In HACS, open **Frontend** and select **Custom repositories**.
2. Add this repository with category **Dashboard**.
3. Install **Schedule Card** and reload the browser.
4. Add the card from the dashboard's card picker.

Alternatively, copy `schedule-card.js` into `config/www/`, then add it as a JavaScript module resource at `/local/schedule-card.js`.

## Configuration

Use the Lovelace visual editor's multi-select entity dropdown to choose schedules and set a label and color for each schedule. Labels are display-only; an empty label uses the schedule's Home Assistant name. Choose a whole-week or single-day view, 12-hour AM/PM or 24-hour time, and whether to show the header or legend. Turn off **Enable editing** to make the chart read-only. Without an entity selection, all stored schedules are displayed. When several schedules are shown, use the in-card schedule selector to choose which one to edit. Click an empty lane to create a one-hour range, drag across a lane to choose its duration, drag a bar to move it, or drag either edge to resize it. Select a bar to edit its start and end times in the full-width row above the chart; use the trash icon at the row's right edge to remove it. Changes save automatically.

The equivalent YAML options are:

```yaml
type: custom:schedule-card
title: Weekly schedules
entities: [schedule.weekday, schedule.weekend]
colors:
  schedule.weekday: "#c99bf2"
  schedule.weekend: "#5ec7b1"
labels:
  schedule.weekday: "Weekday heating"
  schedule.weekend: "Weekend heating"
view: week # week or day
day: today # today, monday, tuesday, wednesday, thursday, friday, saturday, sunday
time_format: 24h # 24h or 12h (AM/PM)
show_header: true
show_legend: true
edit_enabled: true
```

The interface follows Home Assistant's selected language, with English and German strings and locale-aware weekday names. Set `time_format: 12h` to use AM/PM in the chart and time fields; `24h` is the default. End-of-day is shown as `12:00 AM (+1d)` in 12-hour mode. Schedule values are saved in Home Assistant's required 24-hour format. Time edits are snapped to 15-minute increments and validated by Home Assistant. Only storage-backed schedules are editable; YAML-defined schedules are not writable through Home Assistant's schedule collection API.
