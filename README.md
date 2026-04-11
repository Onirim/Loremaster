![Camply Logo](https://onirim.github.io/Camply/android-chrome-192x192.png)

# Camply - a Lite TTRPG Campaign Manager

Template website for managing tabletop role-playing game campaigns.
Stack: Vanilla HTML/CSS/JS + Supabase + GitHub Pages.
What the template manages (do not modify)

- Discord Auth via Supabase
- Characters (with optionnal stat system)
- Chronicles (campaign stories with Markdown entries)
- Documents (shareable Markdown documents)
- Maps (with pins)
- Campaigns (collections grouping characters + chronicles + documents + maps)
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

    In Supabase SQL Editor:
   ```
        For a fresh install: run only sql/00_fresh_install.sql

        For an existing database upgrade: run migration files one by one, in order:
        sql/00_schema.sql
        sql/01_tags.sql
        sql/02_followed.sql
        sql/03_chronicles.sql
        sql/04_documents.sql
        sql/05_document_tags.sql
        sql/06_storage.sql
        sql/07_migration_campaigns.sql
        sql/08_fix-profiles-v2.sql
        sql/09_character_tag.sql
        sql/10_transfer.sql
        sql/11_transfer_auto_follow.sql
        sql/12_transfer_fix_double.sql
        sql/13_sync_owner_tags.sql
        sql/14_fix_doc_tags_unique_conflict.sql
        sql/15_map_markers.sql
        sql/16_map_sharing.sql
        sql/17_multi_map.sql
   ```
    Configure Discord auth in Authentication > Providers
    Add the GitHub Pages URL in Authentication > URL Configuration

4. **Fill in supabase-client.js**

```
const SUPABASE_URL = 'https://XXXX.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XXXX';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

5. **Update the branding**

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

6. **Set a campaign map** (optional)
    Edit map-config.js and add your maps if you want to use them in the application. 
