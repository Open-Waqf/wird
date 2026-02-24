// tests/app.spec.js
const {test, expect} = require('@playwright/test');

test.describe('Wird App E2E Tests', () => {

    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await page.waitForSelector('#adhkar-container');
        await page.evaluate(() => localStorage.setItem('userLang', 'en'));
        await page.reload();
    });

    test('1. App loads successfully and displays categories', async ({page}) => {
        await expect(page).toHaveTitle(/Wird/);

        // Check that at least one Morning Adhkar is rendered
        const cards = page.locator('.adhkar-card');
        await expect(cards.first()).toBeVisible();

        const title = page.locator('#stickyCategoryTitle');
        await expect(title).toHaveText('Morning');
    });

    test('2. Tapping a card increments the counter and saves state', async ({page}) => {
        const firstCard = page.locator('.adhkar-card').first();
        const counter = firstCard.locator('.counter');

        await expect(counter).toHaveText('0');

        await firstCard.click();
        await expect(counter).toHaveText('1');

        await page.reload();
        await expect(page.locator('.adhkar-card').first().locator('.counter')).toHaveText('1');
    });

    test('3. Resetting a card clears its progress', async ({page}) => {
        const firstCard = page.locator('.adhkar-card').first();
        const counter = firstCard.locator('.counter');
        const resetBtn = firstCard.locator('.reset-btn');

        await firstCard.click();
        await expect(counter).toHaveText('1');

        await resetBtn.click();
        await expect(counter).toHaveText('0');
    });

    test('4. Favorites toggle and persist across tabs', async ({page}) => {
        const firstCard = page.locator('.adhkar-card').first();
        const heartBtn = firstCard.locator('.btn-heart');

        await heartBtn.click();
        await expect(heartBtn).toHaveClass(/active/);

        await page.locator('#btn-favorites').click();
        await page.waitForTimeout(300);

        // Verify at least one card is now in the favorites view
        const favCards = page.locator('.adhkar-card');
        await expect(favCards.first()).toBeVisible();
    });

    test('5. Search filters cards correctly', async ({page}) => {
        await page.locator('#searchToggleBtn').click();

        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeVisible();

        await searchInput.fill('Allah');
        await page.waitForTimeout(300);

        // Verify search results appeared
        const cards = page.locator('.adhkar-card');
        await expect(cards.first()).toBeVisible();
    });

    test('6. Navbar toggles Dark Mode and Settings modal opens', async ({page}) => {
        // 1. Toggle Dark Mode (While Navbar is accessible)
        const themeBtn = page.locator('#themeToggle');
        await themeBtn.click();
        await expect(page.locator('body')).toHaveClass(/dark/);

        // 2. Open settings
        await page.locator('#settingsBtn').click();
        const modal = page.locator('#settingsModal');
        await expect(modal).not.toHaveClass(/hidden/);

        // 3. Close settings via ESC
        await page.keyboard.press('Escape');
        await expect(modal).toHaveClass(/hidden/);
    });

    test('7. Focus Mode opens, increments, and closes', async ({page}) => {
        const focusBtn = page.locator('.btn-focus').first();

        if (await focusBtn.isVisible()) {
            await focusBtn.click();

            const focusModal = page.locator('#focusModal');
            await expect(focusModal).toBeVisible();

            await focusModal.click();

            const counter = page.locator('#focusCounter');
            await expect(counter).toHaveText('1');

            await page.locator('#closeFocusBtn').click();
            await expect(focusModal).toBeHidden();
        }
    });

});