# iPhone Purchase

Independent personal purchase-management tool, not affiliated with Apple Inc. Open the root `index.html` through GitHub Pages on an iPhone. The app uses GBP and stores records locally in the browser.

## Publishing

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, select the branch containing these changes and the **/(root)** folder, then save.
3. Wait for the Pages deployment and open the URL shown in Settings on your iPhone. The root `index.html` is the entry point.

## Records and backups

Export a JSON backup from Reports and save it somewhere private, such as iCloud Drive. JSON restore replaces the records in this browser; export first. CSV is a spreadsheet export, not a restorable backup. Browser-local data does not sync to another device and can disappear if Safari data is cleared. Attachments are included in JSON backups and increase storage use; the app limits each attachment to 1.5 MB. Do not commit backups, invoices or personal records to this public repository.

The new app imports the previous `ipurchase_data` browser records once into the versioned `ipurchase_v2` store, leaving the original key untouched. Existing combined accessory totals remain combined, and missing balance acquisition costs remain unknown. Export a backup before updating. The old `Index.html` is retained for recovery, but changes made there after migration will not sync to the new app. Migration only works on the same origin and browser where the old data was saved.

## Planner and cash in hand

The planner shows live item and payment totals, the separate non-refundable amount, and the total including it. Enter Apple ID balances and choose cash or a card to cover the invoice remainder, or select manual split. Add the iPhone model, storage, colour and price before saving the transaction. Accessory expected refunds default to the line price until edited. New Apple ID balances have unknown acquisition costs; previously recorded costs are preserved.

Count and set cash in hand at the start of each day. The planner shows this balance before and after the planned cash payment. The non-refundable amount is separate and is not assumed to be cash received. The displayed balance subtracts cash purchases saved after the count and adds cash refunds completed from the planner after that count; changing the count starts again from that moment. Earlier records, other expenses, and refunds recorded elsewhere without a confirmed cash method are not included. Deleting a transaction also removes its associated movements. A new count is needed each day. The accessory count excludes whole lines marked returned or fully refunded; partial refunds do not change the quantity in hand. Completing a planner refund records the full outstanding amount as cash and marks the whole line returned.

The first timer counts from the last saved transaction and resumes after reload; for older records without a saved time it uses the purchase time. The other timer is independent and runs only while the page is open. Transaction History displays a 14-calendar-day return reminder calculated from the local purchase date, including the last date and days remaining or overdue. It is a reminder, not a guarantee of eligibility; check the retailer’s actual policy and receipt.

## Invoice privacy and limitations

Invoice files stay in browser storage. Image OCR uses the existing Tesseract.js 5 CDN dependency and downloads its software and English language data only after confirmation; it processes the selected image locally. Internet access is needed for the download. PDF attachment and manual verification are supported, but PDF OCR is not implemented. Barcode/QR detection uses the browser's optional `BarcodeDetector` API and may not be available in iPhone Safari. Decoded values are not assumed to be invoice details. OCR suggestions can be incorrect and require manual review. Only the invoice total is compared automatically; product matching is a manual confirmation. Invoice approval never changes the original purchase plan.

Estimated profit is not confirmed actual profit. Actual profit remains unavailable because receipt of extra amounts and all other cash flows is not separately confirmed. Unknown balance costs make profit incomplete. Payment exceptions are explicitly recorded rather than marked reconciled.
