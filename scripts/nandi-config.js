/* Nandi config — holds runtime values like webhook endpoints.
 * Edit this file to update without rebuilding.
 *
 * Email capture wiring:
 *   1. Google Sheet ready: "Nandi Email Captures"
 *      https://docs.google.com/spreadsheets/d/1VSTW9KsX9bP-5Wl67fEkKOyiU0mqJba2dxLtYaquO94/edit
 *      Columns: Email, Source, Page, Timestamp, User Agent
 *   2. Create a Pipedream HTTP-trigger workflow that appends a row to the sheet above.
 *   3. Paste the workflow URL below. Until then, emails save to localStorage on the user's device.
 */
window.NANDI_EMAIL_WEBHOOK = "";
