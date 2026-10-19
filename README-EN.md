# 📺 OMG Premium TV for Stremio

***[🇮🇹 Leggi in italiano](README.md)*** - ***[🇬🇧 Read in English](README-EN.md)*** - ***[🇫🇷 Lire en Français](README-FR.md)*** - ***[🇪🇸 Leer en español](README-ES.md)***

> 🚀 **Version 8.4.1**: rewritten in TypeScript/TSX with multi-user architecture, instant stream checks, "Proxy Only" enforcement, smart permissive EPG matching, and dynamic catalogs, and **Xtream Codes** accounts as a channel source (live channels, plus movies and TV series linked to IMDb with your own TMDB key). Each configuration is stored on the server with an **ID and a password** and installed with a plain `https://your-domain/c/<ID>/manifest.json` URL (no parameters). Admin panel at `/admin`, step-by-step setup wizard, worldwide preset TV guides (epgshare01) shared across users, **EasyProxy** and MediaFlow support (with ClearKey), **Nuvio** compatibility, Cloudflare Tunnel/Worker support. *Note: v7.0.0 is available on the dedicated `7.0.0` branch.* **PostgreSQL is required.** See [docs/DEPLOY.md](docs/DEPLOY.md) (Italian).

## 👋 Introduction

Welcome to OMG Premium TV, the Stremio addon that allows you to watch your favorite TV and IPTV channels from M3U/M3U8 playlists, enriched with program information (EPG). This guide will help you make the most of all available features.

<img width="1440" alt="Screenshot 2025-02-28 alle 21 36 52" src="https://github.com/user-attachments/assets/c85b2a33-0174-4cb3-b7a9-2cc2140c8c0f" />

### ⚠️ Please read carefully!

Working on this addon and keeping it updated has taken countless hours and dedication ❤️
A coffee ☕ or a beer 🍺 is a much appreciated gesture of recognition and helps me continue to maintain this project active!

**With a donation, you'll be added to a dedicated Telegram group where you'll receive new versions in advance! I'll be waiting for you!**

<a href="https://www.buymeacoffee.com/mccoy88f"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a beer&emoji=🍺&slug=mccoy88f&button_colour=FFDD00&font_colour=000000&font_family=Bree&outline_colour=000000&coffee_colour=ffffff" /></a>

[You can also buy me a beer with PayPal 🍻](https://paypal.me/mccoy88f?country.x=US&locale.x=en_US)

## 🔄 OMG Premium TV Changelog

### 🚀 Version 7.0.0 (Current)

### ✨ New Features
- **🔒 Home password protection**: Option in the web UI to protect access to the configuration page with a password. When enabled, anyone opening the home (or the "Configure" link from Stremio) must enter the password; using the addon from Stremio does not require a password.
- **🔄 Sessions and isolated cache**: Cache is automatically isolated per configuration (same config = same cache). EPG, Python Resolver, and Playlist Generator are also per-session. Multiple users or different configurations can use the server at the same time without overwriting each other's data.
- **🆔 Session ID**: The **Session ID** (derived from the configuration) is shown on the home/config page when you generate a configuration. The ID is also included in backup (export) and updated on restore (import).
- **⏰ Session expiry (24h)**: If a session receives no requests for **24 hours**, it expires automatically: all cache for that session (M3U cache, EPG, resolver, generator) is removed. On the next request with the same config, the session is recreated and data is repopulated from the URLs.

### 🔧 Improvements
- **🌐 UI in 4 languages**: The web interface is available in Italian, English, Spanish, and French; you can switch language from the bar at the top right.
- **📋 Preset lists (optional)**: On the configuration page, a section lets you add with one click the predefined iptv-org and iptv-epg.org playlist and EPG URLs by country (M3U and EPG fields).
- **⚙️ Settings section**: The catalog has a **⚙️** genre filter that groups utility channels: **Refresh M3U playlist**, **Refresh EPG**, and **Regenerate Python playlist**. Descriptions and messages are in English.
- **🔄 Pseudo-channels**: Opening a channel from the ⚙️ section runs the action (reload playlist, EPG update, or Python regeneration) and shows an outcome message; no real video stream.
- **♻️ Cache on restart**: If the cache is empty (e.g. after a Docker restart), the playlist and EPG are rebuilt automatically on the first request when M3U/EPG URLs are configured.
- **📺 EPG and channel IDs**: Improved EPG matching for channels with suffixes (e.g. `canale5.it` / `canale5`).
- **🔒 Home protection UI**: When protection is active you see the checkbox and a "Modifica password" (Change password) button; password and confirm fields only appear when you click it.
- **🔗 Return after login**: After entering the password on the gate you are redirected back to the page you came from (e.g. configuration page with encoded URL).

### 🚀 Version 6.0.0

### 📢 Name Rebrand
- **📜 OMG+ becomes OMG Premium**: New name to differentiate and highlight all the new available functions. OMG TV remains as the basic version with preset channels. It will no longer be updated.

### ✨ New Features
- **🐍 Python Resolver**: Complete system to resolve streaming URLs via customizable Python scripts
- **🔄 Regeneration Channel**: New channel in the ~SETTINGS~ category to regenerate the playlist without accessing the web panel
- **🛠️ Backup and Restore**: System to save and restore the complete configuration
- **🔧 Resolver Template**: Feature to automatically create customizable resolver script templates
- **👤 Advanced User-Agent**: Improved management of User-Agent, Referer, and Origin headers
- **🧩 Python Modules**: Integrated support for requests and other Python modules for advanced scripts

### 🔧 Improvements
- **🐳 Improved Docker Support**: Optimized configurations for Hugging Face and Portainer
- **♻️ Intelligent Cache**: Completely redesigned cache system with improved performance
- **🔄 Scheduled Updates**: Precise control of the update interval in HH:MM format
- **📋 Renewed Web Interface**: More intuitive configuration panel with rich features
- **⚡ Optimized Streaming**: Better management of fallback between proxy and direct streams
- **🛡️ Robust Error Handling**: Improved error handling system and multiple retry attempts

### 🐛 Fixes
- **🔄 Infinite Loop Fixed**: Fixed the infinite loop issue with resolver and proxy active
- **🔌 Improved Compatibility**: Resolved compatibility issues with different playlist types
- **🧰 HTTP Header Fix**: Fixed custom HTTP header handling
- **🔍 Channel Search Fix**: Improved channel search for partial matches
- **📊 EPG Optimization**: Resolved issues with large EPG files

## 📝 Update Notes
- Previous configurations are NOT compatible with OMG TV and OMG+ TV installations.
- It is recommended to perform a new installation from scratch on Hugging Face or VPS (Portainer recommended)
- To take advantage of Python resolver features, you need to configure it in the advanced section

For complete details on the operation of new features, consult the updated user manual.

## 🚀 Getting Started: Installation

### 🐳 Deploy on DOCKER
- To proceed, you must first install via Docker on Hugging Face or VPS.
- [Follow the guide here](docker-install-en.md) and then return to this page once your addon website is available.
- If all of this seems incomprehensible to you, STOP; look for an online guide on Docker, check the support section at the bottom of this page, or ask an AI for help 😊

### 📲 Addon Installation
1. Open the OMG Premium TV configuration web page
2. Configure the addon according to your needs
3. Click on the **INSTALL ON STREMIO** button 🔘
4. Stremio will open automatically and ask you to confirm the installation
5. Click on **Install** ✅

## ⚙️ Basic Configuration

### 📋 Playlist Configuration
- **M3U URL** 📋: Enter the URL of your M3U/M3U8 playlist
  - *Single example*: `http://example.com/playlist.m3u`
  - *Multiple example*: `http://example.com/playlist1.m3u,http://example.com/playlist2.m3u`
  - 💡 **New**: You can enter multiple M3U URLs separated by commas (,) to combine multiple playlists

### 📊 EPG Configuration
- **EPG URL** 📊: Enter the URL of the EPG file (electronic program guide)
  - *Single example*: `http://example.com/epg.xml` or `http://example.com/epg.xml.gz`
  - *Multiple example*: `http://example.com/epg1.xml,http://example.com/epg2.xml`
  - 💡 **New**: You can enter multiple EPG URLs separated by commas (,) to combine multiple program guides
- **Enable EPG** ✅: Check this box to display program information

## 🔍 Using the Addon

### 📱 Catalog Navigation
1. Open Stremio
2. Go to the **Discover** section 🔍
3. Select **TV Channels** and then **OMG Premium TV** from the addon list
4. You'll see the complete list of available channels

### 🎯 Channel Filtering
- **By genre** 🏷️: Select a genre from the dropdown menu to filter channels
- **Search** 🔍: Use the search function to find specific channels by name

### 🎬 Viewing Channel Details
Click on a channel to see:
- 📋 Channel information
- 📺 Currently airing program (if EPG enabled)
- 🕒 Upcoming programs (if EPG enabled)
- 🏷️ Channel categories

### ▶️ Channel Playback
- Click on the channel and then on the **WATCH** button ▶️
- Choose from available stream options:
  - 📺 **Original Stream**: The standard stream from the playlist
  - 🌐 **Proxy Stream**: The stream through a proxy (greater compatibility)
  - 🧩 **Resolved Stream**: The stream processed by a resolver script (for special channels)

## 🛠️ Advanced Settings

### 🔒 Protect home access
- **Enable password protection** ✅: When enabled, the next visit to the configuration page (home or "Configure" link from Stremio) will require the password. The addon in Stremio keeps working without a password.
- **Change password**: When protection is active you see "Protezione attiva" (Protection active) and the **Modifica password** (Change password) button; clicking it shows the fields to change the password. To disable protection, uncheck the box and save (no password needed).
- The password is set and changed only from the web UI; it is not required to watch channels from Stremio.

### 🌐 Proxy Configuration
- **Proxy URL** 🔗: URL of the proxy for streams (only compatible with [MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy))
- **Proxy Password** 🔑: Password for proxy authentication
- **Force Proxy** ✅: Forces all streams to use the proxy

### 🆔 ID Management and Updates
- **ID Suffix** 🏷️: Adds a suffix to channel IDs without an ID in the playlist (e.g., `.it`)
- **Remapper File Path** 📝: Specify a file for EPG ID remapping
- **Update Interval** ⏱️: Specify how often to update the playlist (format `HH:MM`)

## 🐍 Advanced Python Features

### 🔄 Playlist Generation with Python Script
1. **Python Script URL** 🔗: Enter the URL of the Python script
2. **DOWNLOAD SCRIPT** 💾: Download the script to the server
3. **RUN SCRIPT** ▶️: Run the script to generate the playlist
4. **USE THIS PLAYLIST** ✅: Use the generated playlist as a source

### ⏱️ Automatic Updates
- Enter the desired interval (e.g., `12:00` for 12 hours)
- Click on **SCHEDULE** 📅 to activate automatic updates
- Click on **STOP** ⏹️ to deactivate updates

### 🧩 Python Resolver Configuration
- **Resolver Script URL** 🔗: Enter the URL of the resolver script
- **Enable Python Resolver** ✅: Activate the use of the resolver
- **DOWNLOAD SCRIPT** 💾: Download the resolver script
- **CREATE TEMPLATE** 📋: Create a customizable resolver script template
- **CHECK SCRIPT** ✅: Verify that the resolver script works correctly
- **CLEAR CACHE** 🧹: Empty the resolver cache

## 💾 Backup and Restore

### 📤 Configuration Backup
1. Click on **BACKUP CONFIGURATION** 💾
2. A JSON file will be downloaded with all your settings (including the **Session ID** for the current config)

### 📥 Configuration Restore
1. Click on **RESTORE CONFIGURATION** 📤
2. Select the previously saved JSON file
3. Wait for the restore to complete (the Session ID on the page updates according to the restored config)

## ❓ Troubleshooting

### ⚠️ Non-working Streams
- Try activating the **Force Proxy** option ✅
- Verify that the playlist URL is correct
- Try using a Python resolver script for problematic channels

### 📊 EPG Problems
- Verify that the EPG URL is correct
- Check that the **Enable EPG** option ✅ is activated
- Make sure channel IDs match between playlist and EPG

### 🐍 Python Script Problems
- Check that Python is installed on the addon server
- Check the script status in the **Python Script Status** section
- Try downloading the script again

## 🔄 Updates and Maintenance

### 🔄 Settings Modification
- In Stremio, go to **Settings** ⚙️ > **Addons**
- Click on **Configure** 🔄 next to OMG Premium TV
- Access the configuration page, make the changes you want
- Press **Generate Configuration**
- To avoid duplicates, remove the addon on Stremio
- Return to the configuration page and click **Install on Stremio**

### 🔧 Playlist regeneration and quick updates
- In the **⚙️** section (genre filter in the catalog) you will find: **Refresh M3U playlist** (reload from source), **Refresh EPG** (update program guide), **Regenerate Python playlist** (run script and reload). Open the channel and follow the on-screen message.

## 📋 Summary of Main Features

- ✅ M3U/M3U8 playlist support
- ✅ EPG program guide support (XMLTV)
- ✅ Genre filters and search
- ✅ Proxy for greater compatibility
- ✅ Python resolver for special streams
- ✅ Custom playlist generation
- ✅ Automatic updates
- ✅ Configuration backup and restore
- ✅ Optional password protection for the configuration page
- ✅ Cache isolated per configuration (concurrent access)
- ✅ Session ID visible and included in export/import
- ✅ Automatic expiry of inactive sessions (24h) to free space
- TECH SPEC on [wiki](https://github.com/mccoy88f/OMG-Premium-TV/wiki/Tech-Spec-%E2%80%90-Specifiche-Teniche))


## 📱 Compatibility

OMG PremTV works on all platforms supported by Stremio:
- 💻 Windows
- 🍎 macOS
- 🐧 Linux
- 📱 Android
- 📱 iOS (via web browser)
- 📺 Android TV
- 📺 Apple TV

## 👥 Community
- If you're looking for support, guides, or information about the OMG world, MediaFlow Proxy, and Stremio, you can visit:
- [Reddit (Team Stremio Italia)](https://www.reddit.com/r/Stremio_Italia/)
- [Telegram Group (in Italian)](http:/t.me/Stremio_ITA)

## 👏 Acknowledgements
- FuriousCat for the OMG name idea
- Stremio Italia Team
- Telegram Community (see Community section)
- Iconic Panda for the [icon](https://www.flaticon.com/free-icon/tv_18223703?term=tv&page=1&position=2&origin=tag&related_id=18223703)
- [Background Video](https://it.vecteezy.com/video/1803236-no-signal-bad-tv) for the frontend and dummy streams created by igor.h (on Vecteezy)

## 📜 License
Project released under MIT license.

---

📚 **Important Note**: OMG Premium TV is designed to access legal content. No channels or streams are included in the addon. Make sure to comply with your country's regulations regarding content streaming.

🌟 Thank you for choosing OMG Premium TV! Enjoy watching! 🌟
