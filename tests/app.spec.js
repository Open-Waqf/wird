const {test, expect} = require('@playwright/test');

test.describe('Wird App E2E Tests', () => {
    test.beforeEach(async ({page}) => {
        // Freeze time so "today key" and any date-based logic is deterministic.
        const now = new Date('2026-02-24T10:00:00.000+01:00').getTime();

        await page.addInitScript(({now}) => {
            // Mock Capacitor Preferences globally for tests
            // Use sessionStorage so it survives reloads but is separate from localStorage
            window.Capacitor = {
                isNativePlatform: () => false,
                Plugins: {
                    Preferences: {
                        get: async ({key}) => {
                            const val = sessionStorage.getItem('_cap_' + key);
                            return { value: val };
                        },
                        set: async ({key, value}) => {
                            sessionStorage.setItem('_cap_' + key, String(value));
                        },
                        remove: async ({key}) => {
                            sessionStorage.removeItem('_cap_' + key);
                        },
                        keys: async () => {
                            const keys = [];
                            for (let i = 0; i < sessionStorage.length; i++) {
                                const k = sessionStorage.key(i);
                                if (k && k.startsWith('_cap_')) keys.push(k.substring(5));
                            }
                            return { keys };
                        }
                    }
                }
            };

            // Freeze Date
            const OriginalDate = Date;
            class MockDate extends OriginalDate {
                constructor(...args) {
                    if (args.length === 0) super(now);
                    else super(...args);
                }
                static now() { return now; }
            }
            MockDate.UTC = OriginalDate.UTC;
            MockDate.parse = OriginalDate.parse;
            MockDate.prototype = OriginalDate.prototype;
            window.Date = MockDate;
        }, {now});

        await page.goto('/');
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload();
        await page.waitForSelector('#adhkar-container');
    });

    test('1. App loads successfully and displays categories', async ({page}) => {
        await expect(page).toHaveTitle(/Wird/);
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
        await page.waitForSelector('#adhkar-container');
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

        const favCards = page.locator('.adhkar-card');
        await expect(favCards.first()).toBeVisible();
    });

    test('5. Search filters cards correctly', async ({page}) => {
        await page.locator('#searchToggleBtn').click();
        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('Allah');
        await page.waitForTimeout(300);
        const cards = page.locator('.adhkar-card');
        await expect(cards.first()).toBeVisible();
    });

    test('6. Navbar toggles Dark Mode and Settings modal opens', async ({page}) => {
        const themeBtn = page.locator('#themeToggle');
        await themeBtn.click();
        await expect(page.locator('body')).toHaveClass(/dark/);

        await page.locator('#settingsBtn').click();
        const modal = page.locator('#settingsModal');
        await expect(modal).not.toHaveClass(/hidden/);

        await page.keyboard.press('Escape');
        await expect(modal).toHaveClass(/hidden/);
    });

    test('7. Migrates legacy localStorage data to Preferences', async ({page}) => {
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
            localStorage.setItem('userLang', 'it');
            localStorage.setItem('wird_favorites', JSON.stringify(['morning_1']));
        });

        await page.addInitScript(() => {
            window.Capacitor.isNativePlatform = () => true;
        });

        await page.reload();
        await page.waitForSelector('#adhkar-container');

        const langSelect = page.locator('#langSelect');
        await expect(langSelect).toHaveValue('it');

        await page.locator('#btn-favorites').click();
        const favCards = page.locator('.adhkar-card');
        await expect(favCards.first()).toBeVisible();

        // Verify legacy localStorage was cleared by migration
        const lsLang = await page.evaluate(() => localStorage.getItem('userLang'));
        expect(lsLang).toBeNull();
        
        // Verify it was moved to our sessionStorage mock store
        const prefLang = await page.evaluate(() => sessionStorage.getItem('_cap_userLang'));
        expect(prefLang).toBe('it');
    });
});
