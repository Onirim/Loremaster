# Connexion Supabase non disponible

Camply n'arrive pas à communiquer avec Supabase.

## Vérifications rapides

1. Ouvre `supabase-client.js` et vérifie `SUPABASE_URL` et `SUPABASE_KEY`.
2. Dans Supabase > **Settings > API**, copie la clé **publishable / anon** (pas la service role).
3. Dans Supabase > **Authentication > URL Configuration**, ajoute l'URL GitHub Pages.
4. Vérifie la console navigateur (F12) pour un message CORS / réseau.

Ensuite, clique sur **Réessayer**.
