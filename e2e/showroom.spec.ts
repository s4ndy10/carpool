import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(violations.flatMap((violation) => violation.nodes.map((node) => ({
    rule: violation.id, target: node.target, issue: node.failureSummary,
  })))).toEqual([]);
}

test('administrator manages the collection end to end', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Email address').fill('manager@forecourt.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-tests-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: '911 Carrera', exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-inventory.png`, fullPage: true });
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Make', { exact: true }).fill('Mazda');
  await dialog.getByLabel('Model', { exact: true }).fill('MX-5 Test Edition');
  await dialog.getByLabel('Category', { exact: true }).selectOption('Convertible');
  await dialog.getByLabel('Price (INR)', { exact: true }).fill('32900.50');
  await dialog.getByLabel('Quantity', { exact: true }).fill('1');
  await expectAccessible(page);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-add-vehicle.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Save vehicle', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Search vehicles').fill('Mazda');
  await expect(page.getByRole('heading', { name: 'MX-5 Test Edition' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Mazda MX-5 Test Edition', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Price (INR)', { exact: true }).fill('32000');
  await dialog.getByRole('button', { name: 'Save vehicle', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('₹32,000', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Purchase Mazda MX-5 Test Edition', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Purchase Mazda MX-5 Test Edition', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restock Mazda MX-5 Test Edition', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Units to add').fill('2');
  await dialog.getByRole('button', { name: 'Add stock', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('2 available', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Delete Mazda MX-5 Test Edition', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove vehicle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'MX-5 Test Edition' })).toHaveCount(0);
  const navigationToggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('member registers, filters, purchases, and restores a session', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-login.png`, fullPage: true });
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Full name').fill('Alex Morgan');
  await page.getByLabel('Email address').fill(`alex-${testInfo.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('a-member-password-2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: '911 Carrera', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add vehicle', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Purchase Mercedes-Benz SL 43 Roadster', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Make', exact: true }).selectOption('Toyota');
  await page.getByRole('combobox', { name: 'Model', exact: true }).selectOption('Corolla LE');
  await expect(page.getByRole('heading', { name: 'Corolla LE', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '911 Carrera', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: '911 Carrera', exact: true })).toBeVisible();

  await page.getByLabel('Search vehicles').fill('Porsche');
  await page.getByLabel('Category', { exact: true }).selectOption('Coupe');
  await expect(page.getByRole('heading', { name: 'Defender 110', exact: true })).toHaveCount(0);
  const purchase = page.getByRole('button', { name: 'Purchase Porsche 911 Carrera', exact: true });
  await expect(purchase).toBeEnabled();
  await purchase.click();
  await expect(page.getByRole('status')).toContainText(/purchase/i);
  await page.reload();
  await expect(page.getByRole('heading', { name: '911 Carrera', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add vehicle', exact: true })).toHaveCount(0);
  const navigationToggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await navigationToggle.isVisible()) await navigationToggle.click();
  await page.getByRole('button', { name: 'Open account', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'Your account' });
  await expect(account.getByRole('heading', { name: 'Porsche 911 Carrera' })).toBeVisible();
  await expect(account.getByText('Indian Rupee (INR)')).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-account.png`, fullPage: true });
  await account.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
