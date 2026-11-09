export async function openAccount(page) {
  if (!(await page.locator('#account-panel').isVisible()))
    await page.locator('#app-save-state').click();
}
export async function syncNow(page) {
  await openAccount(page);
  await page.locator('#cloud-retry').click();
  await page.locator('#account-close').click();
}
export async function openOwnedCard(page, language, sourceId, variant) {
  await page.locator(`[data-open-card="${language}:${sourceId}"]`).click();
  if (variant) await page.locator('#detail-finish').selectOption(variant);
}
