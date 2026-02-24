const {defineConfig, devices} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    /* Maximum time one test can run for. */
    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:3000',
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
        /* Automatically set language to English for consistent tests */
        locale: 'en-US',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'Mobile Chrome',
            use: {...devices['Pixel 5']},
        },
        {
            name: 'Mobile Safari',
            use: {...devices['iPhone 12']},
        },
        {
            name: 'Desktop Chrome',
            use: {...devices['Desktop Chrome']},
        }
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: 'npx serve -p 3000 ./www',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});