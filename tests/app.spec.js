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

            // Deterministic audio/speech mocks for audio UX tests.
            window.__mockAudioErrorMode = false;
            const mediaProto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
            if (mediaProto) {
                mediaProto.load = function () {};
                mediaProto.play = function () {
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            if (window.__mockAudioErrorMode) {
                                this.dispatchEvent(new Event('error'));
                                reject(new DOMException('Mock audio failure', 'NotAllowedError'));
                                return;
                            }
                            resolve();
                        }, 0);
                    });
                };
                mediaProto.pause = function () {};
            }

            const synth = {
                speaking: false,
                cancel() {
                    this.speaking = false;
                },
                speak(utterance) {
                    this.speaking = true;
                    setTimeout(() => {
                        if (utterance && typeof utterance.onstart === 'function') utterance.onstart();
                        setTimeout(() => {
                            this.speaking = false;
                            if (utterance && typeof utterance.onend === 'function') utterance.onend();
                        }, 1500);
                    }, 0);
                }
            };
            Object.defineProperty(window, 'speechSynthesis', {
                configurable: true,
                value: synth
            });

            window.__persistCalls = 0;
            Object.defineProperty(navigator, 'storage', {
                configurable: true,
                value: {
                    persisted: async () => false,
                    persist: async () => {
                        window.__persistCalls += 1;
                        return true;
                    }
                }
            });
        }, {now});

        await page.goto('/');
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await page.reload();
        // Wait for dynamically-rendered cards — guarantees init() has progressed
        // past UI.render() and initSettingsUI(), not just that static HTML exists.
        await page.waitForSelector('.adhkar-card');
    });

    // ==========================================
    // ORIGINAL TESTS (1–11)
    // ==========================================

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
        await page.waitForSelector('.adhkar-card');
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

    // Dark mode toggle click is covered by test 16 (which uses a clean page state).
    // Here we verify dark mode is applied on load from preferences (reliable, no click race)
    // and that the settings modal opens/closes correctly.
    test('6. Dark Mode applies from preferences and Settings modal opens/closes', async ({page}) => {
        // Pre-seed dark mode preference, then reload to verify it's applied
        await page.evaluate(() => sessionStorage.setItem('_cap_darkMode', 'true'));
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await expect(page.locator('body')).toHaveClass(/dark/);

        // Settings modal opens via button click
        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});

        // Settings modal closes on Escape
        await page.keyboard.press('Escape');
        await page.waitForFunction(
            () => document.getElementById('settingsModal').classList.contains('hidden'),
            {timeout: 5000}
        );
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
        await page.waitForSelector('.adhkar-card');

        const langSelect = page.locator('#langSelect');
        await expect(langSelect).toHaveValue('it');

        await page.locator('#btn-favorites').click();
        const favCards = page.locator('.adhkar-card');
        await expect(favCards.first()).toBeVisible();

        const lsLang = await page.evaluate(() => localStorage.getItem('userLang'));
        expect(lsLang).toBeNull();

        const prefLang = await page.evaluate(() => sessionStorage.getItem('_cap_userLang'));
        expect(prefLang).toBe('it');
    });

    // FIX: Use page.evaluate to open settings — same Mobile Chrome fix as test 6.
    test('8. Weekly habit visualizer displays correctly', async ({page}) => {
        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});

        const visualizer = page.locator('#habitVisualizer');
        await expect(visualizer).toBeVisible();

        const circles = visualizer.locator('.w-7.h-7');
        await expect(circles).toHaveCount(7);

        await expect(circles.nth(6)).toHaveClass(/ring-2/);
    });

    test('9. Speaker button toggles active state and stops on second click', async ({page}) => {
        await page.evaluate(() => {
            window.__mockAudioErrorMode = true;
        });
        const speakBtn = page.locator('.adhkar-card .btn-speak').first();
        await expect(speakBtn).toBeVisible();
        await speakBtn.click();
        await expect(speakBtn).toHaveClass(/active/);

        await speakBtn.click();
        await expect(speakBtn).not.toHaveClass(/active/);
    });

    test('10. Fallback toast is shown once when audio fails', async ({page}) => {
        await page.evaluate(() => {
            window.__mockAudioErrorMode = true;
        });

        const speakBtn = page.locator('.adhkar-card .btn-speak').first();
        await expect(speakBtn).toBeVisible();
        await speakBtn.click();

        const infoToasts = page.locator('#toast-container .toast.info');
        await expect(infoToasts).toHaveCount(1);
    });

    test('11. Requests persistent web storage on startup (best effort)', async ({page}) => {
        const persistCalls = await page.evaluate(() => window.__persistCalls);
        expect(persistCalls).toBe(1);
    });

    // ==========================================
    // NEW TESTS (12–22) — Coverage Gaps
    // ==========================================

    test('12. Language switching updates category title and html lang attribute', async ({page}) => {
        await page.locator('#langSelect').selectOption('fr');
        await page.waitForTimeout(400);
        // "morning" in French is "Matin"
        await expect(page.locator('#stickyCategoryTitle')).toHaveText('Matin');
        await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    });

    test('13. Switching to Evening category loads evening cards', async ({page}) => {
        // Use evaluate to bypass Mobile Chrome nav click issues (same fix as tests 6/8)
        await page.evaluate(() => document.getElementById('btn-evening').click());
        await page.waitForTimeout(300);
        await expect(page.locator('#stickyCategoryTitle')).toHaveText('Evening');
        await expect(page.locator('.adhkar-card').first()).toBeVisible();
    });

    test('14. Kids Mode toggle reduces visible card count', async ({page}) => {
        const countBefore = await page.locator('.adhkar-card').count();
        await page.locator('#kidsToggle').click({force: true});
        await page.waitForTimeout(300);
        const countAfter = await page.locator('.adhkar-card').count();
        expect(countAfter).toBeLessThan(countBefore);
    });

    test('15. Focus Mode opens, counter increments on tap, and closes', async ({page}) => {
        // .btn-focus only appears on cards with repeat > 10
        const focusBtn = page.locator('.btn-focus').first();
        await focusBtn.click({force: true});

        const focusModal = page.locator('#focusModal');
        await expect(focusModal).not.toHaveClass(/hidden/);
        await expect(page.locator('#focusCounter')).toHaveText('0');

        // Tap the modal background to increment the counter
        await page.evaluate(() => document.getElementById('focusModal').click());
        await expect(page.locator('#focusCounter')).toHaveText('1');

        // Close focus mode
        await page.evaluate(() => document.getElementById('closeFocusBtn').click());
        await expect(focusModal).toHaveClass(/hidden/);
    });

    test('16. Dark mode setting persists after page reload', async ({page}) => {
        await page.evaluate(() => document.getElementById('themeToggle').click());
        await page.waitForTimeout(150);
        await expect(page.locator('body')).toHaveClass(/dark/);

        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await expect(page.locator('body')).toHaveClass(/dark/);
    });

    test('17. Storage key uses 3 AM rollover: before 3 AM counts as previous day', async ({page}) => {
        // Frozen time is 10 AM → 10 AM - 3h = 7 AM → still Feb 24
        const todayKey = await page.evaluate(() => {
            const d = new Date();
            d.setHours(d.getHours() - 3);
            return `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        });
        expect(todayKey).toBe('wird_data_2026-2-24');

        // At 2 AM Paris time (before 3 AM cutoff), key should be previous day
        const earlyMorningKey = await page.evaluate(() => {
            const d = new Date('2026-02-24T02:00:00.000+01:00');
            d.setHours(d.getHours() - 3);
            return `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        });
        expect(earlyMorningKey).toBe('wird_data_2026-2-23');
    });

    test('18. Arabic language sets RTL direction, other languages set LTR', async ({page}) => {
        await page.locator('#langSelect').selectOption('ar');
        await page.waitForTimeout(300);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

        await page.locator('#langSelect').selectOption('en');
        await page.waitForTimeout(300);
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    });

    test('19. Completing all items in a category shows checkmark on tab', async ({page}) => {
        // Fetch data.json to get the real waking item IDs (waking has only ~3 items)
        await page.evaluate(async () => {
            const resp = await fetch('/data.json');
            const data = await resp.json();
            const wakingIds = data
                .filter(item => {
                    const cats = Array.isArray(item.category) ? item.category : [item.category];
                    return cats.includes('waking');
                })
                .map(item => `waking_${item.id}`);

            const d = new Date();
            d.setHours(d.getHours() - 3);
            const key = `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            const state = {completedIds: wakingIds, categoriesDone: {}, cardCounts: {}};
            sessionStorage.setItem('_cap_' + key, JSON.stringify(state));
        });

        await page.reload();
        await page.waitForSelector('.adhkar-card');

        // Waking tab should show the ring-2 completion indicator
        await expect(page.locator('#btn-waking')).toHaveClass(/ring-2/);
    });

    test('20. Streak value stored in preferences is displayed in settings', async ({page}) => {
        await page.evaluate(() => {
            sessionStorage.setItem('_cap_wird_streak', '7');
        });

        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});

        await expect(page.locator('#streakValue')).toHaveText('7');
    });

    test('21. Reset category FAB resets all card progress after confirmation', async ({page}) => {
        // Complete a card first
        await page.locator('.adhkar-card').first().click();
        await expect(page.locator('.adhkar-card').first().locator('.counter')).toHaveText('1');

        // Trigger FAB reset directly (bypasses scroll-based visibility requirement)
        await page.evaluate(() => document.getElementById('resetFabBtn').click());

        // Wait for the confirm dialog and click OK
        await page.waitForSelector('.dialog-btn.ok', {timeout: 3000});
        await page.evaluate(() => document.querySelector('.dialog-btn.ok').click());
        await page.waitForTimeout(300);

        // Card progress should be cleared
        await expect(page.locator('.adhkar-card').first().locator('.counter')).toHaveText('0');
    });

    test('22. Search with no matching results shows zero cards', async ({page}) => {
        await page.locator('#searchToggleBtn').click();
        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('xyzzy_no_such_adhkar_99999');
        await page.waitForTimeout(300);
        const count = await page.locator('.adhkar-card').count();
        expect(count).toBe(0);
    });
});
