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

Use the Lovelace visual editor's multi-select entity dropdown to choose schedules and set a label and color for each schedule. Labels are display-only; an empty label uses the schedule's Home Assistant name. Choose a whole-week or single-day view, and show or hide the header and legend. Without an entity selection, all stored schedules are displayed. The chart has no add, edit, or delete buttons: drag across an empty schedule lane to create a time, drag a bar to move it, or drag a bar edge to resize it. Every change saves automatically.

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
show_header: true
show_legend: true
```

The interface follows Home Assistant's selected language, with English and German strings and locale-aware weekday names. Editing requires an administrator account. Only storage-backed schedules can be edited; YAML-defined schedules are not writable through Home Assistant's schedule collection API.
