import { expect, test } from '@playwright/test'

test('search journey renders results section', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'חיפוש' }).first()).toBeVisible()

  await page.getByPlaceholder(/חפשו/).fill('rock')
  await page.getByRole('button', { name: 'חיפוש' }).first().click()

  await expect(page).toHaveURL(/\/?\?q=rock/)
  await expect(page.locator('main')).toContainText(/תוצאות|לא נמצאו תוצאות/)
})

test('store listing to record details journey works', async ({ page }) => {
  await page.goto('/stores')

  await expect(page.getByRole('heading', { name: 'חנויות וסטטיסטיקה' })).toBeVisible()

  const browseLink = page.getByRole('link', { name: /צפה בתקליטים/ }).first()
  await expect(browseLink).toBeVisible()
  await browseLink.click()

  await expect(page).toHaveURL(/\/?\?store=/)
  await expect(page.locator('main')).toContainText(/תוצאות|לא נמצאו תקליטים/)
})

test('wishlist flow persists selected record', async ({ page, request }) => {
  const recordsRes = await request.get('/api/all-records?page=1&per_page=1')
  expect(recordsRes.ok()).toBeTruthy()

  const payload = (await recordsRes.json()) as {
    records?: Array<{ id?: string }>
  }

  const firstRecordId = payload.records?.[0]?.id
  expect(firstRecordId).toBeTruthy()

  await page.goto('/')
  await page.evaluate((recordId) => {
    const payload = [{ recordId, addedAt: new Date().toISOString() }]
    window.localStorage.setItem('vinyl-wishlist', JSON.stringify(payload))
  }, firstRecordId)

  await page.goto('/wishlist')
  await expect(page.getByRole('heading', { name: 'המועדפים שלי' })).toBeVisible()
  await expect(page.locator('div[role="button"][aria-label]').first()).toBeVisible()
})
