![Camply Logo](https://onirim.github.io/Camply/android-chrome-192x192.png)

# Camply - a Lite TTRPG Campaign Manager

Template website for managing tabletop role-playing game campaigns.
Stack: Vanilla HTML/CSS/JS + Supabase + GitHub Pages.
What the template manages (do not modify)

- Discord Auth via Supabase
- Chronicles (campaign stories with Markdown entries)
- Documents (shareable Markdown documents)
- Campaigns (collections grouping characters + chronicles + documents)
- Sharing system via 8-character code
- Subscription to other player's content
- Ownership transfers of objects
- Tags and filters
- Illustration uploads
- i18n FR/EN
- PWA (service worker, manifest)

Optional: Adapt for your game

    game-system.js
    editor.js

## New project setup
1. **Create the GitHub repo**

    Click "Use this template" on GitHub
    Give the repo a name (e.g., my-game-campaign-manager)
    Enable GitHub Pages on the main branch (Settings > Pages)

2. **Create the Discord Auth application**

    In OAuth2, retrieve the client ID and secret key
    In Redirects, insert the Callback URL of the Supabase project (see below)

3. **Create a Supabase project (can be a free project)**

    In Supabase SQL Editor, execute in this order:
   ```
        sql/00_schema.sql
        sql/01_tags.sql
        sql/02_followed.sql
        sql/03_chronicles.sql
        sql/04_documents.sql
        sql/05_document_tags.sql
        sql/06_storage.sql
        sql/07_migration_campaigns.sql
        sql/08_fix_profiles-v2.sql
        sql/09_character_tag.sql
        sql/10_transfer.sql
        sql/11_transfer_auto_follow.sql
        sql/12_transfer_fix_double
   ```
    Configure Discord auth in Authentication > Providers
    Add the GitHub Pages URL in Authentication > URL Configuration

4. **Fill in supabase-client.js**

```
const SUPABASE_URL = 'https://XXXX.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XXXX';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

5. **Adapt game-system.js and editor.js (optional)**

These are the only two files truly specific to the game. See the section below.

6. **Update the branding**

In index.html:
```
<title>My Game — Campaign Manager</title>
```
In site.webmanifest:
```
{
  "name": "My Game",
  "short_name": "My Game",
  "start_url": "/my-repo/"
}
```
In sw.js, change the cache name:
```
const CACHE_NAME = 'my-game-v1';
```
And update PRECACHE_ASSETS with the correct path /my-repo/.

## Adapt game-system.js:
Mandatory functions to implement
| Function |  Constant Role |
| --- | --- |
| GAME_NAME |	Name displayed in the logo |
| GAME_SUBTITLE	| Subtitle under the logo |
| freshState()	| Returns an empty character |
| renderCharCardBody(c)	| HTML of the card in the roster |
| renderCharSheet(data)	| Complete sheet HTML (preview + shared view) |
| GAME_I18N	| FR/EN translations specific to the game |

