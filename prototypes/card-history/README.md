# Card history UI prototype

A separate HTML, CSS, and JavaScript prototype for review. It uses sample stories and direct TCGdex image URLs. It does not read or change app records. Changes stay in memory and reset when the page reloads.

Open `index.html` in a browser, or serve this folder:

```sh
python3 -m http.server 8790 --bind 127.0.0.1 --directory prototypes/card-history
```

Then open <http://127.0.0.1:8790>.

## App layout comparison

Run this command to compare the existing card page with the proposed history section:

```sh
node prototypes/card-history/serve.mjs
```

Open <http://127.0.0.1:8791>. Select **Current app** or **With history**. The page uses the app's existing base styles and `src/client/cloud.css`. It uses sample records and a separate script for the controls. It does not use account routes or a database.

Use **+**, then **Add details**, to describe the copy you just added. This must keep the copy count unchanged. On **Wanted card**, switch between **Regular** and **Reverse holo** to see separate sample quantities and history.

Use **−** to remove a copy. Choose the copy, then record what happened: sold, traded, given away, lost, other, or details not recorded. The owned count decreases. The original entry stays in **Card history**, with the later change below it. Dates, people, amounts received, and notes are optional.

Change the owned count to a lower number to remove several copies at once. Choose the quantity from each entry. Copies without details also keep a record when removed. An amount received belongs to the whole change, including when it covers several entries.

Select **Previously owned** to see a sample card with zero copies owned and a saved purchase and sale. **All**, **Still owned**, and **Previously owned** filter the history entries. Use the edit button next to a later change to add or correct details without changing copy counts. The original entry cannot be deleted once it has later changes.

The local server serves only the listed UI files. It does not serve private files or account records.

## Standalone prototype

Try these flows:

- **Owned card:** read three entries, add a copy, or edit an entry.
- **Wanted card:** change the target price and notes. Select **I got this card** to record how you got it. The amount paid starts blank. You can keep the card on your wishlist.
- **No details yet:** add details to copies that are already counted.
- **Previously owned:** read a saved purchase and sale after the owned count reaches zero.
- In the entry form, select **Bought**, **Pulled**, **Gift**, **Trade**, or **Other**. The fields change with the method.
- Switch between **New copies** and **Copies I already own**. Check the count message before saving.
- Delete an entry to remove its details. The owned count stays the same.
- Select **Reset demo** to start again.

All detail fields are optional. An entry needs a method and a copy count. The amount is the total for the copies in that entry. A price of zero differs from a blank price.

The layout uses spacing to separate entries. The card image has no outer frame. Form fields keep visible borders.

This folder is outside `public/`, `src/`, and the app build. It needs no database, new package, or hosted service.
