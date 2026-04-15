# Base de données non initialisée

La connexion Supabase est correcte, mais la structure SQL de Camply est absente.

## Ce que Camply tente de faire

- Exécuter automatiquement `sql/00_fresh_install.sql`.
- Refaire une vérification de la table `profiles`.

## Si l'installation automatique échoue

1. Ouvre **Supabase > SQL Editor**.
2. Copie/colle le contenu de `sql/00_fresh_install.sql`.
3. Exécute le script.
4. Reviens dans l'app et clique sur **Réessayer**.

Tu peux aussi cliquer sur **Ouvrir le script SQL** pour l'afficher dans l'onglet du dépôt.
