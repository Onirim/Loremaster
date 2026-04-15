# Provider Discord non configuré

Supabase est accessible, la base est prête, mais l'authentification Discord n'est pas active.

## Étapes

1. Crée une application Discord (Developer Portal).
2. Récupère `Client ID` et `Client Secret`.
3. Dans Supabase > **Authentication > Providers > Discord**, active le provider.
4. Colle `Client ID` et `Client Secret`.
5. Ajoute le callback Supabase dans Discord OAuth Redirects.
6. Ajoute l'URL GitHub Pages dans Supabase > **Authentication > URL Configuration**.

Ensuite clique sur **Réessayer**.
