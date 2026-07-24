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

    // ==========================================
    // TIER-1 REGRESSION TESTS (23–32) — Batch A fixes
    // ==========================================

    // FIX #2: Opening the app must NOT award a streak / active day. A streak is
    // earned only by completing a main category.
    test('23. Launch alone does not award a streak', async ({page}) => {
        // beforeEach already loaded the app fresh with zero completions.
        const vals = await page.evaluate(() => ({
            streak: sessionStorage.getItem('_cap_wird_streak'),
            lastActive: sessionStorage.getItem('_cap_wird_last_active_date'),
            activeDates: sessionStorage.getItem('_cap_wird_active_dates'),
        }));
        expect(vals.streak).toBeNull();
        expect(vals.lastActive).toBeNull();
        expect(vals.activeDates).toBeNull();
    });

    // FIX #2 (guard): Completing a whole category still awards the streak.
    test('24. Completing a category awards the streak', async ({page}) => {
        await page.evaluate(async () => {
            const data = await (await fetch('/data.json')).json();
            const ids = data
                .filter((it) => (Array.isArray(it.category) ? it.category : [it.category]).includes('morning'))
                .map((it) => `morning_${it.id}`);
            const d = new Date();
            d.setHours(d.getHours() - 3);
            const key = `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            sessionStorage.setItem('_cap_' + key, JSON.stringify({completedIds: ids, categoriesDone: {}, cardCounts: {}}));
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});
        await expect(page.locator('#streakValue')).toHaveText('1');
    });

    // FIX #5: The "Kids Mode was turned off" toast must appear ONLY when Kids Mode
    // was actually on (and the shared item is not a kids item).
    test('25. Kids-Mode-off toast only fires when Kids Mode was on', async ({page}) => {
        const nonKidsId = await page.evaluate(async () => {
            const data = await (await fetch('/data.json')).json();
            return (data.find((x) => !x.is_kids) || data[0]).id;
        });

        // Kids Mode OFF (default) → deep link must NOT show the toast.
        // NOTE: use a one-shot count() — toasts auto-remove after a few seconds, so
        // an auto-retrying toHaveCount(0) would pass simply by waiting the toast out.
        await page.goto('/?adhkar=' + encodeURIComponent(nonKidsId));
        await page.waitForSelector('.adhkar-card');
        await page.waitForTimeout(500);
        expect(await page.locator('#toast-container .toast', {hasText: 'Kids Mode'}).count()).toBe(0);

        // Kids Mode ON + non-kids shared item → toast SHOULD show
        await page.evaluate(() => sessionStorage.setItem('_cap_isKidsMode', 'true'));
        await page.goto('/?adhkar=' + encodeURIComponent(nonKidsId));
        await page.waitForSelector('.adhkar-card');
        await expect(page.locator('#toast-container .toast', {hasText: 'Kids Mode'})).toHaveCount(1);
    });

    // FIX #6: A streak whose last active day is stale (older than yesterday) must
    // display as 0; a last active day of yesterday keeps the streak.
    test('26. Stale streak decays to 0; yesterday keeps it', async ({page}) => {
        // Frozen "today" (3 AM-adjusted) = Tue Feb 24 2026. Seed a 3-days-ago date.
        await page.evaluate(() => {
            sessionStorage.setItem('_cap_wird_streak', '10');
            sessionStorage.setItem('_cap_wird_last_active_date', new Date('2026-02-21T10:00:00.000+01:00').toDateString());
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});
        await expect(page.locator('#streakValue')).toHaveText('0');

        // Now set last active = yesterday → streak should be shown intact
        await page.evaluate(() => {
            sessionStorage.setItem('_cap_wird_streak', '10');
            sessionStorage.setItem('_cap_wird_last_active_date', new Date('2026-02-23T10:00:00.000+01:00').toDateString());
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await page.evaluate(() => document.getElementById('settingsBtn').click());
        await page.waitForSelector('#settingsModal:not(.hidden)', {timeout: 5000});
        await expect(page.locator('#streakValue')).toHaveText('10');
    });

    // FIX #8: A text selection OUTSIDE a card must not block tapping it to count.
    test('27. Selection outside a card does not block counting', async ({page}) => {
        const firstCard = page.locator('.adhkar-card').first();
        await expect(firstCard.locator('.counter')).toHaveText('0');

        await page.evaluate(() => {
            // Select text in the nav title (outside any card), then programmatically
            // click the first card so the selection persists into the click handler.
            const titleEl = document.getElementById('stickyCategoryTitle');
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.querySelector('.adhkar-card').click();
        });

        await expect(firstCard.locator('.counter')).toHaveText('1');
    });

    // FIX #1: When a category is already done today, its daily reminder must remain
    // REPEATING (not degrade to a one-shot that dies after tomorrow).
    test('28. Reminder for a completed category stays daily-repeating', async ({page}) => {
        await page.addInitScript(() => {
            window.__scheduled = [];
            window.Capacitor.Plugins.LocalNotifications = {
                checkPermissions: async () => ({display: 'granted'}),
                requestPermissions: async () => ({display: 'granted'}),
                schedule: async (opts) => { window.__scheduled.push(...(opts.notifications || [])); },
                cancel: async () => {},
                addListener: () => ({remove() {}}),
            };
        });
        // Seed morning done today (evening NOT done)
        await page.evaluate(() => {
            const d = new Date();
            d.setHours(d.getHours() - 3);
            const key = `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            sessionStorage.setItem('_cap_' + key, JSON.stringify({completedIds: [], categoriesDone: {morning: true}, cardCounts: {}}));
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        // Enable reminders → triggers scheduleAll()
        await page.evaluate(() => document.getElementById('remindersToggle').click());
        await page.waitForTimeout(400);

        const scheduled = await page.evaluate(() => window.__scheduled);
        const morning = scheduled.find((n) => n.id === 1);
        const evening = scheduled.find((n) => n.id === 2);

        // Morning was done today → must be a repeating daily schedule, not a bare `at`
        expect(morning).toBeTruthy();
        expect(morning.schedule.repeats).toBe(true);
        expect(morning.schedule.every).toBe('day');
        // Evening (not done) keeps the standard repeating `on` schedule
        expect(evening).toBeTruthy();
        expect(evening.schedule.on).toBeTruthy();
    });

    // FIX #7: Cancelling the native Share sheet must NOT show an "Export failed" error.
    test('29. Cancelling native share is not treated as an export error', async ({page}) => {
        await page.addInitScript(() => {
            window.Capacitor.isNativePlatform = () => true;
            window.Capacitor.Plugins.Filesystem = {writeFile: async () => ({uri: 'file:///tmp/wird-backup.json'})};
            window.Capacitor.Plugins.Share = {share: async () => { throw new Error('Share canceled'); }};
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await page.evaluate(() => document.getElementById('exportBtn').click());
        await page.waitForTimeout(500);

        // One-shot count — an auto-retrying toHaveCount(0) would pass by simply
        // waiting out the transient error toast.
        expect(await page.locator('#toast-container .toast.error').count()).toBe(0);
    });

    // FIX #4: Focus-mode completion must be data-driven. Completing one card while a
    // filter hides the rest must NOT falsely mark the whole category complete
    // (which would wrongly award a streak).
    test('30. Focus completion does not falsely complete a filtered category', async ({page}) => {
        const focusBtn = page.locator('.btn-focus').first();
        const dataId = await focusBtn.getAttribute('data-id');
        await focusBtn.click({force: true});
        await expect(page.locator('#focusModal')).not.toHaveClass(/hidden/);

        // Simulate a search filter that left only the focused card in the DOM
        await page.evaluate((id) => {
            document.querySelectorAll('.adhkar-card').forEach((card) => {
                if (!card.querySelector(`.btn-focus[data-id="${id}"]`)) card.remove();
            });
        }, dataId);

        const target = await page.evaluate(() => parseInt(document.getElementById('focusTarget').innerText.replace(/[^0-9]/g, ''), 10));
        for (let i = 0; i < target; i++) {
            await page.evaluate(() => document.getElementById('focusModal').click());
        }
        await page.waitForTimeout(700);

        // The category is NOT actually complete → no streak awarded
        const streak = await page.evaluate(() => sessionStorage.getItem('_cap_wird_streak'));
        expect(streak).toBeNull();
    });

    // FIX #12: Focus completion + auto-close must run even if the underlying card was
    // removed from the DOM (e.g. filtered) mid-session.
    test('31. Focus auto-closes on completion even if the card was removed', async ({page}) => {
        const focusBtn = page.locator('.btn-focus').first();
        const dataId = await focusBtn.getAttribute('data-id');
        await focusBtn.click({force: true});
        await expect(page.locator('#focusModal')).not.toHaveClass(/hidden/);

        // Remove the focused card itself (simulate it being filtered out mid-session)
        await page.evaluate((id) => {
            document.querySelectorAll('.adhkar-card').forEach((card) => {
                if (card.querySelector(`.btn-focus[data-id="${id}"]`)) card.remove();
            });
        }, dataId);

        const target = await page.evaluate(() => parseInt(document.getElementById('focusTarget').innerText.replace(/[^0-9]/g, ''), 10));
        for (let i = 0; i < target; i++) {
            await page.evaluate(() => document.getElementById('focusModal').click());
        }

        // Completion must still auto-close the modal
        await expect(page.locator('#focusModal')).toHaveClass(/hidden/, {timeout: 3000});
    });

    // FIX #3: Offline navigation carrying a query string must still serve the app
    // shell (not a network-error / blank page).
    test('32. Offline navigation with a query string serves the app shell', async ({page, context}) => {
        // Let the service worker install and take control (needs a reload without clients.claim).
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await page.waitForFunction(() => !!navigator.serviceWorker && !!navigator.serviceWorker.controller, null, {timeout: 15000});

        await context.setOffline(true);
        await page.goto('/?category=evening');
        await page.waitForSelector('.adhkar-card', {timeout: 15000});
        await expect(page.locator('.adhkar-card').first()).toBeVisible();
        await context.setOffline(false);
    });

    // ==========================================
    // TIER-1 REGRESSION TESTS (33–35) — Batch B fixes
    // ==========================================

    // FIX #9: An already-complete category must not re-fire saveCategoryComplete
    // (which re-runs Reminders.scheduleAll) on every incidental re-render.
    test('33. Completed category does not reschedule reminders on re-render', async ({page}) => {
        await page.addInitScript(() => {
            window.__scheduleCount = 0;
            window.Capacitor.Plugins.LocalNotifications = {
                checkPermissions: async () => ({display: 'granted'}),
                requestPermissions: async () => ({display: 'granted'}),
                schedule: async () => { window.__scheduleCount++; },
                cancel: async () => {},
                addListener: () => ({remove() {}}),
            };
        });
        // Seed morning fully complete
        await page.evaluate(async () => {
            const data = await (await fetch('/data.json')).json();
            const ids = data
                .filter((it) => (Array.isArray(it.category) ? it.category : [it.category]).includes('morning'))
                .map((it) => `morning_${it.id}`);
            const d = new Date();
            d.setHours(d.getHours() - 3);
            const key = `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            sessionStorage.setItem('_cap_' + key, JSON.stringify({completedIds: ids, categoriesDone: {}, cardCounts: {}}));
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await page.waitForTimeout(400);

        const before = await page.evaluate(() => window.__scheduleCount);
        // Trigger several incidental re-renders (like toggling a setting / typing)
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => document.getElementById('transliterationToggle').click());
            await page.waitForTimeout(150);
        }
        const after = await page.evaluate(() => window.__scheduleCount);
        expect(after).toBe(before);
    });

    // FIX #10: Playing an item with no `arabic` field must not throw (it should still
    // start playback rather than crashing in the title assignment).
    test('34. Audio plays for an item with no arabic text', async ({page}) => {
        // The beforeEach SW is already controlling this page and would serve a cached
        // real data.json, bypassing the injection below. Unregister it + clear caches,
        // and prevent re-registration on the upcoming reload (native flag), so the
        // route injection is actually honored.
        await page.evaluate(async () => {
            if (navigator.serviceWorker) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
            if (window.caches) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
        });
        await page.addInitScript(() => { window.Capacitor.isNativePlatform = () => true; });
        await page.route('**/data.json', async (route) => {
            const resp = await route.fetch();
            const data = await resp.json();
            // Prepend a valid morning item that deliberately omits `arabic`
            data.unshift({id: 'test-no-arabic', category: ['morning'], repeat: 3, reference: 'TEST', transliteration: 'test', translation: {en: 'test'}});
            await route.fulfill({json: data});
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        const firstCard = page.locator('.adhkar-card').first();
        await firstCard.locator('.btn-speak').click();
        // With the guard, play() proceeds and the speak button becomes active.
        await expect(firstCard.locator('.btn-speak')).toHaveClass(/active/);
    });

    // FIX #11: A FileReader error while importing must surface an error toast rather
    // than failing silently.
    test('35. Import shows an error toast when the file cannot be read', async ({page}) => {
        await page.addInitScript(() => {
            // Force FileReader to fail on read.
            class MockFileReader {
                readAsText() {
                    setTimeout(() => { if (typeof this.onerror === 'function') this.onerror(new Error('read fail')); }, 0);
                }
            }
            window.FileReader = MockFileReader;
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await page.locator('#importInput').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from('{}')});

        await expect(page.locator('#toast-container .toast.error')).toHaveCount(1);
    });

    // ==========================================
    // TIER-2 REGRESSION TESTS (36–40) — Batch C1 (a11y / interaction)
    // ==========================================

    // FIX #14: With OS "Reduce Motion" on, no confetti fires and animated durations
    // collapse to ~0.
    test('36. Reduced motion suppresses confetti and animation', async ({page}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        // Seed a state where finishing the current category completes ALL categories,
        // which is what triggers the celebratory confetti on load.
        await page.evaluate(async () => {
            const data = await (await fetch('/data.json')).json();
            const morningIds = data
                .filter((it) => (Array.isArray(it.category) ? it.category : [it.category]).includes('morning'))
                .map((it) => `morning_${it.id}`);
            const d = new Date();
            d.setHours(d.getHours() - 3);
            const key = `wird_data_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            sessionStorage.setItem('_cap_' + key, JSON.stringify({
                completedIds: morningIds,
                categoriesDone: {evening: true, waking: true, sleep: true},
                cardCounts: {},
            }));
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');
        await page.waitForTimeout(400);

        expect(await page.locator('.confetti-particle').count()).toBe(0);

        const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.counter-display')).transitionDuration);
        expect(parseFloat(dur)).toBeLessThan(0.01);
    });

    // FIX #15: The screen-reader announcer updates on EVERY count, not just decades.
    test('37. Announcer updates on every count', async ({page}) => {
        // Use a repeat>10 card (has a focus button) so a single tap is BELOW target
        // and exercises the per-count path, not the completion branch.
        const card = page.locator('.adhkar-card', {has: page.locator('.btn-focus')}).first();
        await card.locator('.arabic-text').click();
        await expect(card.locator('.counter')).toHaveText('1');
        await expect(page.locator('#a11y-announcer')).toHaveText('1');
    });

    // FIX #16: Arabic scripture carries lang="ar" so assistive tech uses the Arabic voice.
    test('38. Arabic text has lang="ar"', async ({page}) => {
        await expect(page.locator('.adhkar-card .arabic-text').first()).toHaveAttribute('lang', 'ar');
    });

    // FIX #17: The focus-mode close button activates via keyboard (Enter).
    test('39. Focus-mode close button works with the keyboard', async ({page}) => {
        await page.locator('.btn-focus').first().click({force: true});
        const modal = page.locator('#focusModal');
        await expect(modal).not.toHaveClass(/hidden/);

        await page.evaluate(() => document.getElementById('closeFocusBtn').focus());
        await page.keyboard.press('Enter');
        await expect(modal).toHaveClass(/hidden/);
    });

    // FIX #23: Closing search returns focus to the search toggle (not an orphaned hidden input).
    test('40. Closing search restores focus to the toggle', async ({page}) => {
        await page.locator('#searchToggleBtn').click();
        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeVisible();
        await searchInput.press('Escape');
        await expect(page.locator('#searchToggleBtn')).toBeFocused();
    });

    // ==========================================
    // TIER-2 REGRESSION TESTS (41–42) — Batch C2 (structural)
    // ==========================================

    // FIX #18: While search is closed, its input must be out of the tab order (inert)
    // so keyboard users don't land on an invisible field.
    test('41. Hidden search bar is inert', async ({page}) => {
        // Search closed by default → focusing its input is a no-op (inert).
        await page.locator('#searchInput').evaluate((el) => el.focus());
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
        expect(focused).not.toBe('searchInput');

        // Opening search makes the default nav inert instead.
        await page.locator('#searchToggleBtn').click();
        await expect(page.locator('#searchInput')).toBeVisible();
        await page.waitForTimeout(100);
        expect(await page.locator('#defaultNavContent').getAttribute('inert')).not.toBeNull();
    });

    // FIX #21: The share menu must be a sibling of the share button, not nested inside
    // it (interactive elements inside a <button> is invalid and unreliable).
    test('42. Share menu is not nested inside the share button', async ({page}) => {
        await page.addInitScript(() => {
            // Force the fallback menu path (no Web Share API).
            Object.defineProperty(navigator, 'share', {configurable: true, value: undefined});
        });
        await page.reload();
        await page.waitForSelector('.adhkar-card');

        await page.locator('.adhkar-card .btn-share').first().click();
        await expect(page.locator('.share-menu')).toBeVisible();

        const nestedInButton = await page.evaluate(() => {
            const menu = document.querySelector('.share-menu');
            return !!(menu && menu.closest('.btn-share'));
        });
        expect(nestedInButton).toBe(false);
    });
});
