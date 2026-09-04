# Deploying to Render

This application needs a Docker web service because it runs Chromium through
Playwright. Deploy only against a signup environment you are authorized to test.

1. Create a private GitHub repository and push this project. Do not commit
   `.env`.
2. In Render, select **New +** > **Blueprint** and select the repository.
   Render reads `render.yaml` and builds the supplied Dockerfile.
3. In the Render dashboard, set the values marked as secret environment
   variables: `SIGNUP_URL`, `HOME_URL`, `SIGNUP_NAME`, `SIGNUP_PLACE`,
   `SIGNUP_PASSWORD`, `DASHBOARD_USERNAME`, and `DASHBOARD_PASSWORD`.
4. Deploy the service and open its generated HTTPS URL. The browser will ask
   for the dashboard username and password before serving the page or API.

`HEADLESS=true` is configured for cloud operation. Use `HEADLESS=false` only
when running locally with a desktop browser.

The `results` and `screenshots` directories are container-local and are lost on
redeploy. Use object storage or add an application data directory backed by a
persistent disk if those artifacts must be retained.
