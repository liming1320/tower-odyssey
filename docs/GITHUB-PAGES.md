# GitHub Pages Offline Pinball

The workflow in `.github/workflows/deploy-offline-pwa.yml` publishes the offline pinball package to GitHub Pages whenever `master` is pushed.

## One-time GitHub setting

Open the repository on GitHub, then choose `Settings` -> `Pages`. Under `Build and deployment`, set `Source` to `GitHub Actions`.

After the next successful workflow run, the site is available at:

```text
https://liming1320.github.io/tower-odyssey/
```

The workflow builds with the `/tower-odyssey` base path. Do not upload the `dist/` directory manually; it is rebuilt by GitHub Actions.

For offline play on iPhone, open the page once in Safari while online, wait until the game finishes loading, then use Share -> Add to Home Screen.
