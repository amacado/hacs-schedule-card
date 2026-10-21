# Schedule Card

![Schedule Card icon](https://raw.githubusercontent.com/amacado/hacs-schedule-card/main/icon.svg)

Visualize and edit schedules created by Home Assistant's built-in [Schedule integration](https://www.home-assistant.io/integrations/schedule/).

## Install

### HACS

1. In HACS, open **Frontend** and select **Custom repositories**.
2. Add this repository with the **Dashboard** category.
3. Install **Schedule Card** and reload the browser.
4. Add the card from the dashboard card picker.

### Manual

Copy `schedule-card.js` into `config/www/`, then add `/local/schedule-card.js` as a JavaScript module resource.

## Configure

Use the Lovelace visual editor to select schedules and customize their labels and colors. You can also choose a week or single-day view, set the time format, and show or hide the header and legend. Turn off **Enable editing** to make the chart read-only.

When no entities are selected, the card displays all stored schedules. If multiple schedules are selected, choose which one to edit from the selector above the chart.

## Edit schedules

- Click an empty lane to create a one-hour range, or drag across it to set the duration.
- Drag a range to move it. Drag either edge to resize it.
- Select a range to edit its start and end in the full-width row above the chart. Use the trash icon at the row's right edge to remove it.
- Changes save automatically. Home Assistant reports invalid times and overlaps in the card.

Times snap to 15-minute increments. In 12-hour mode, end-of-day is shown as `12:00 AM (+1d)`; values are saved in Home Assistant's 24-hour format.

## YAML configuration

The visual editor is optional. Configure the card directly in YAML:

```yaml
type: custom:schedule-card
title: Weekly schedules
entities:
  - schedule.weekday
  - schedule.weekend
colors:
  schedule.weekday: "#c99bf2"
  schedule.weekend: "#5ec7b1"
labels:
  schedule.weekday: "Weekday heating"
  schedule.weekend: "Weekend heating"
view: week # week or day
day: today # today or a weekday
time_format: 24h # 24h or 12h (AM/PM)
show_header: true
show_legend: true
edit_enabled: true
```

The card follows Home Assistant's language, with English and German interface strings and locale-aware weekday names. Only storage-backed schedules can be edited; YAML-defined schedules are read-only.

## Releases

HACS uses the latest published GitHub Release tag as the card version. Releases follow SemVer and use tags in the form `vMAJOR.MINOR.PATCH`; HACS requires a published release, not just a tag.
