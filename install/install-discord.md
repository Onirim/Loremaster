# Discord Provider Not Configured

Supabase is accessible, the database is ready, but Discord authentication is not active.

## Steps

### 1. Create a Discord application via the Developer Portal: https://discord.com/developers/applications
### 2. In the OAuth2 tab > retrieve the `Client ID`, then generate the `Client Secret` and retrieve it as well.

![Discord Developer Portal](./install/supabase_6.png)

### 3. In Supabase > Authentication > Providers > Discord, enable the provider.

![Supabase Discord Auth](./install/supabase_7.png)

### 4. Paste the `Client ID` and `Client Secret`
### 5. Retrieve the `Discord OAuth Redirect`.

![Supabase Discord Auth](./install/supabase_8.png)

### 6. In the Discord Developer Portal, add the Supabase callback in Discord OAuth Redirects.

![Supabase Discord Auth](./install/supabase_9.png)

### 7. Add the GitHub Pages URL in Supabase > Authentication > URL Configuration.

![Adding Github Pages URL](./install/supabase_3.png)

Then click on **Retry**.
