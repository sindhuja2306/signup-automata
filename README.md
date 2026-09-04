# Authorized staging signup automation

This project submits signup forms only for phone numbers explicitly supplied in `TEST_NUMBERS` or `config/config.json`. It does not bypass OTP, CAPTCHA, rate limits, or other anti-bot controls. If your staging flow requires an OTP, configure the staging environment to bypass it for the approved test numbers before running this tool.

## Install

```powershell
npm install
npx playwright install chromium
```

## Configure

Copy `.env.example` to `.env` and replace every staging placeholder, including `SIGNUP_URL` with the real authorized staging hostname. The runner refuses to start when the example URL remains configured. Put only approved test numbers in `TEST_NUMBERS`, separated by commas. Each number must be exactly 10 digits and start with `4`, `5`, `6`, `7`, `8`, or `9`.

The same values can be placed in `config/config.json`; environment variables take precedence. Do not commit `.env` or real credentials.

Set `HOME_URL` to the staging site's home-page URL. The runner records `SUCCESS` only after signup reaches that URL; if navigation does not reach home, the attempt is `FAILED`. Optionally set `SUCCESS_SELECTOR` to an element shown only after account creation for an additional confirmation. Referral credit must still be confirmed in the staging account or backend, because it is applied server-side.

## Run

```powershell
npm start
```

The runner opens the signup page for every approved number, fills the configured fields, submits the form, waits between submissions, and continues after failures. Results are written after each attempt to `results/results.csv` and `results/results.json`. Failed attempts also create a screenshot under `screenshots/`.

## Project structure

```text
config/config.json       JSON fallback configuration
src/runner.js            Browser lifecycle, validation, loop, and result writing
src/signup.js            Signup form and approved OTP interaction
src/report.js            Regenerates a report from results.json
.env.example              Environment variable template
package.json              Scripts and dependencies
```

`npm run report` can regenerate `results.csv` after a run.
