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

Use the Lovelace visual editor's entity dropdown to select multiple schedules and set each schedule's color. Choose a whole-week or single-day view, and show or hide the header. Without an entity selection, all stored schedules are displayed. Each schedule has an inline switch to disable or enable its entity.

The equivalent YAML options are:

```yaml
type: custom:schedule-card
title: Weekly schedules
entities: [schedule.weekday, schedule.weekend]
colors:
  schedule.weekday: "#c99bf2"
  schedule.weekend: "#5ec7b1"
view: week # week or day
day: today # today, monday, tuesday, wednesday, thursday, friday, saturday, sunday
show_header: true
```

The interface follows Home Assistant's selected language, with English and German strings and locale-aware weekday names. Editing and disabling entities require an administrator account. Only storage-backed schedules can be edited; disabling an entity is handled by Home Assistant's entity registry, and re-enabling may require a Home Assistant restart.
