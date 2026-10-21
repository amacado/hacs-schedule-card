# Schedule Card

A Lovelace card for visualizing and editing schedules stored by Home Assistant's built-in [Schedule integration](https://www.home-assistant.io/integrations/schedule/). The weekly timeline shows each configured time range. Create, edit, and delete schedules directly from the dashboard, including per-range action data.

The card manages schedules created in the integration's storage collection. YAML-defined schedules are not returned by the integration's storage API and cannot be edited by this card.

## Install with HACS

1. In HACS, open **Frontend** and select **Custom repositories**.
2. Add this repository with category **Dashboard**.
3. Install **Schedule Card** and reload the browser.
4. Add the card from the dashboard's card picker.

Alternatively, copy `schedule-card.js` into `config/www/`, then add it as a JavaScript module resource at `/local/schedule-card.js`.

## Configuration

Use the Lovelace visual editor to select multiple schedule entities, set an individual color for each, choose a whole-week or single-day view, and show or hide the card header. Without an entity selection, all stored schedules are displayed.

The equivalent YAML options are:

```yaml
type: custom:schedule-card
title: Weekly schedules
entities:
	- schedule.weekday
	- schedule.weekend
colors:
	schedule.weekday: "#c99bf2"
	schedule.weekend: "#5ec7b1"
view: week # week or day
day: today # today, monday, tuesday, wednesday, thursday, friday, saturday, sunday
show_header: true
```

The interface follows Home Assistant's selected language, with English and German strings and locale-aware weekday names. Schedule creation, updates, and deletion use the built-in schedule websocket collection. Editing requires an administrator account, and only storage-backed schedule entities are editable. Home Assistant validates time ranges, including overlaps.
