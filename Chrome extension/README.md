# Webshare VPN

A Chrome extension for Webshare proxies, with site routing, a green active indicator, download speed in Mbps and HTTP latency in milliseconds. It includes ten starter proxy endpoints and a comparison button.

This is an independent project, not an official Webshare product. It routes supported Chrome traffic through HTTP proxies. It does not create a system VPN tunnel.

[Preview and setup guide](https://humanlike.co/apps/webshare-vpn).

[Download the latest ZIP](https://github.com/mmkontis/Webshare-VPN/releases/latest) and extract it before loading it into Chrome. Credentials are entered locally and are not included in the repository or release.

## Install

First replace the starter `ROUTES` addresses and ports in `core.js` with your own Webshare proxy list. Each Webshare account has its own endpoints. Then:

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode.
3. Click Load unpacked and select the folder containing `manifest.json`: `Chrome extension` in a cloned repository, or `Webshare-VPN` after extracting the release ZIP.
4. Pin Webshare VPN from Chrome's extensions menu.
5. Open the extension, choose Settings, then Proxy credentials and enter your shared Webshare username and password. The downloadable package contains no credentials.
6. Select a proxy, enable the switch and reload ChatGPT. Frankfurt is selected initially as the initial starter route. Test your own connection to compare routes.
7. Click Test speed and latency. Disable the proxy and test again to compare your current browser route.

## Test all proxies

Click **Test all proxies** to test the browser default route and all ten proxy routes sequentially. Save the shared credentials first. The popup shows progress, failures and a speed ranking with one decimal place. A complete comparison downloads up to 55 MB plus tiny latency probes. To preserve service worker operation, it reserves time to restore your route and reports any routes it cannot start within its four minute limit. Those routes can be tested individually. The browser default route uses Chrome's existing applicable settings, which may include another system proxy.

The extension temporarily changes the ChatGPT route during the comparison. It restores your original proxy selection and enabled state when finished. Closing the popup does not cancel the comparison. Reopen it to see progress. If Chrome interrupts the service worker, the next start attempts to restore the original route and marks the comparison interrupted. A restoration failure is shown explicitly. Websites follow your saved Settings scope while the comparison runs.

## Rounded webpage panel

The toolbar popup's outer native window is controlled by Chrome. Our CSS rounds the content panel, not that native frame. For a fully rounded outer edge, open a regular website and choose **Settings → Open rounded panel**. This mounts the meter in a rounded frame inside the webpage. It can be closed with ×. It does not run on Chrome internal pages. Chrome requires activeTab and scripting access for this user-triggered operation. A private per-tab session token authorizes the embedded extension view; an arbitrary webpage cannot embed a working settings panel.

## Latency

The test button measures both download speed and HTTP latency. Latency is the median time to receive HTTPS response headers from three uncached one-byte requests to Cloudflare. It includes network and server response time. It is not ICMP ping, ChatGPT model generation time, or latency to ChatGPT itself. Lower latency means the tested route responds faster. The comparison table shows Mbps and ms for every successful route. If the latency probe fails but the download succeeds, Mbps is retained and latency is unavailable.

## Indicators

The toolbar icon and Active label turn green only when Chrome confirms this extension controls the exact selected proxy configuration. A connection check verifies the exit IP against the selected proxy. A failed test or a proxy setting conflict changes the indicator to red. Green does not guarantee that ChatGPT will allow the IP or that an existing tab's connections have switched. Reload ChatGPT after changing routes.

The toolbar badge shows the latest speed rounded to one decimal place. The popup shows the units, route and sample time. Until a measurement exists, the active badge reads ON. The scale runs from 0.1 to 100+ Mbps; measurements are not capped at 100.0. Very low speeds may round to 0.0.

## Measurement

A manual test checks `ipv4.webshare.io` and downloads up to 5 MB from `speed.cloudflare.com`, with caching disabled. Mbps means megabits per second: received bytes × 8 divided by elapsed seconds × 1,000,000. Elapsed time includes connection setup. A transfer taking over 12 seconds uses received bytes as a clearly marked partial sample, provided at least 64 KB arrived. A single small sample is an estimate, especially on fast connections.

This measures the whole browser route to Cloudflare, not ChatGPT model generation speed, account bandwidth, or proxy to ChatGPT latency alone. No continuous background downloads occur. Previous measurements are discarded when the route or credentials change. Disabling this extension releases its proxy override and restores Chrome's previous applicable settings, which may themselves include a proxy.

## Routing and privacy

The Settings tab contains credentials, site routing and the speed test explanation. ChatGPT is selected by default, including its `oaistatic.com` and `oaiusercontent.com` assets and `auth.openai.com`. Select sites with the checkboxes, add a public domain, or choose All sites, then click Save site settings. Selected domains include their subdomains. Chrome requests optional access for newly selected sites or all HTTP/HTTPS sites. Cancelling the request leaves your routing unchanged. Local hostnames and private IPv4 addresses stay direct. The two measurement hosts always follow the selected proxy when enabled. Site favicons come from Chrome’s built-in favicon API, with a local globe fallback. No third-party favicon service is used. Target HTTPS encryption stays enabled. Credentials are stored in this Chrome profile's local extension storage, never synced, never included in the PAC script and supplied only to an authentication challenge from the selected proxy host and port. They are not included in the extension package. This is local storage, not a secure credential vault.

Incognito is unsupported. This is an unpacked extension, not a Chrome Web Store release. No ChatGPT conversation content is read. Chrome may request access to the listed sites and permission to change proxy settings.

## Development

Run `npm test` from the `Chrome extension` folder, or from `Webshare-VPN` if you extracted the release ZIP. No build step or dependencies are required. The PNG icons are included. API references: [Chrome proxy settings](https://developer.chrome.com/docs/extensions/reference/api/proxy), [proxy authentication](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [toolbar action](https://developer.chrome.com/docs/extensions/reference/api/action).
