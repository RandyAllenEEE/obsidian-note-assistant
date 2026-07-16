# Developing the plugin

## How to setup your development environment

1. Clone your repo to a local development folder. For convenience, you can place this folder in your `.obsidian/plugins/your-plugin-name` folder.
2. Install Node.js 20 or newer, then run `npm i` in the command line under your repo folder.
3. Run `npm run build` to compile the plugin, or `npm run dev` to watch for changes.
4. Run `npm run check` before committing; it performs type checking, unit tests, and a production build.
5. Reload Obsidian to load the new version of your plugin.
6. Enable plugin in settings window.
7. For updates to the Obsidian API run `npm update` in the command line under your repo folder.

## Releasing new releases

* Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
* Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
* Update `README.md` with info about the release.
* Update `package.json` with the new version.
* Push the changes to Github.
* Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: <https://github.com/obsidianmd/obsidian-sample-plugin/releases>
* Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments.
* Publish the release.

## Adding your plugin to the community plugin list

* Publish an initial version.
* Make sure you have a `README.md` file in the root of your repo.
* Make a pull request at <https://github.com/obsidianmd/obsidian-releases> to add your plugin.

## Manually installing the plugin

* Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`. (There is a shortcut in the Makefile: `make local-deploy`)

## Obsidian API Documentation

See <https://github.com/obsidianmd/obsidian-api>
