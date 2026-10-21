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

No options are required. The optional `title` changes the card heading:

```yaml
type: custom:schedule-card
title: Weekly schedules
```

Schedule creation, updates, and deletion use Home Assistant's `schedule/list`, `schedule/create`, `schedule/update`, `schedule/delete`, and `schedule/subscribe` websocket commands. Editing requires an administrator account. Schedule time ranges are validated by Home Assistant, including overlap checks.
