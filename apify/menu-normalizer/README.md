# TappyTabs Menu Normalizer & Allergen Tagger

This Actor accepts hand-written or scraped menu items and writes one normalized dataset row per item. TappyTabs uses the output to populate Convex `menuItems`.

## Input

```json
{
  "items": [
    {
      "name": "Pad Thai",
      "description": "Rice noodles with tamarind sauce",
      "ingredients": ["egg", "crushed peanuts", "fish sauce"],
      "price": "$18.00",
      "category": "Mains"
    }
  ],
  "batchSize": 20
}
```

`name` is required. `description`, `ingredients`, `price`, and `category` are optional. Prices may be a formatted string or a numeric value; output prices are cents. Set the Actor secrets `BITDEER_API_KEY` and `BITDEER_MODEL` to enable model enrichment; without them, the deterministic keyword pass runs and uncertain allergen fields stay conservative.

## Output

Each dataset row matches the Convex menu item shape, excluding `restaurantId`: `name`, `category`, optional `cuisine`, `tags`, `description`, `priceCents`, `allergens`, `diet`, `spice`, `isDrink`, `shareable`, `menuOrder`, and `tagStatus`.

The keyword pass runs before model enrichment. Model output may only add or raise allergen warnings, and diet labels are intersected with the deterministic pass. If enrichment fails, unconfirmed allergens become `may_contain` and `tagStatus` is `untagged`; TappyTabs agents do not recommend untagged items.

## Local development and publishing

From this directory, run `npm install`, `npm test`, then `npm run local` to run the checked-in input fixture. Publish with the Apify CLI after configuring the Actor in your account; set its public Store visibility there. TappyTabs calls the published Actor using the Convex environment variables `APIFY_TOKEN` and `APIFY_NORMALIZER_ACTOR` (`username/menu-normalizer`).
