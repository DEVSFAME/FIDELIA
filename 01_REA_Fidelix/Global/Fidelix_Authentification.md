---
type: rea
status: done
module: global
tags: [rea, fidelix, auth, supabase]
updated: 2026-10-26
---

# Authentification

## 1. Fournisseur : Supabase GoTrue

Littéraux relevés dans les bundles publics (`raw/assets/*.js`) :

| Appel | Occurrences |
|---|---|
| `auth.signOut(` | 4 |
| `auth.onAuthStateChange(` | 2 |
| `auth.getSession(` | 2 |
| `auth.signUp(` | 1 |
| `auth.signInWithPassword(` | 1 |
| `auth.resend(` | 1 |
| `auth.getUser(` | 1 |

URL du projet : `https://rozagopjfkkblyxtjdgw.supabase.co` (2 occurrences).
> Clé `anon` **non recopiée** : elle est publique par conception mais n'a aucune
> raison de figurer dans un document. Elle n'a **pas** été utilisée pour lire la base.

## 2. Formulaires observés

### `/login` (`raw/pages/p08-login.html`)
- Champs : **Email professionnel** + **Mot de passe**
- Lien : « Mot de passe oublié ? » → `/forgot-password`
- CTA : « Se connecter » · « Créer un compte » → `/register`
- Colonne marketing : « Gratuit jusqu'à 30 clients », « Apple Wallet », « Scan en caisse »

### `/register` (`raw/pages/p13-register.html`)
- Champs : **Nom complet**, **Email professionnel**, **Numéro de téléphone**,
  **Mot de passe**, **Confirmer le mot de passe**
- Cases : conditions d'utilisation **et** politique de confidentialité (les deux obligatoires)
- CTA : « Créer mon compte gratuitement » — promesse « Programme de fidélité en 2 minutes »

### `/forgot-password` (`raw/pages/p16-forgot-password.html`)
- Adossé à `POST /api/auth/reinitialiser` (13 occurrences dans le bundle)

## 3. Validation (Zod + codes Supabase)

Chaînes mesurées : `same_password`, `weak_password`, `min(6)`,
« Les mots de passe ne correspondent pas », « Mot de passe trop courant »,
« Email ou mot de passe incorrect. », « Adresse email ou mot de passe invalide. »

⇒ Le client **pré-valide** (longueur ≥ 6, confirmation identique) puis **mappe les
codes d'erreur Supabase** vers des messages français. Contrat à reproduire tel quel.

## 4. Gardes

| Type | Comportement mesuré |
|---|---|
| Pages privées | `307 → /login` (12 routes) |
| API | `401` sur **toute** route `/api/*`, y compris inexistante |
| Redirection post-login | **non observée** (exige une session) |

## 5. Session

- Cookies attendus : `sb-<ref>-auth-token`, `sb-<ref>-auth-token-code-verifier`
  (convention GoTrue).
- `auth.onAuthStateChange` ⇒ le shell réagit en direct à la déconnexion/expiration.
- **Non observé** : durée de vie, refresh token, redirection après expiration,
  gestion multi-onglets.

## 6. Ce que la Phase 1 doit lever

- [ ] Le 307 est-il émis par un middleware Next.js global (toute route inconnue) ou
      par une liste de préfixes ? Test : `GET /inexistant-prive` → 404 ou 307 ?
- [ ] Redirection post-login (`/dashboard` ? `/onboarding` si compte neuf ?).
- [ ] Écran `/onboarding` : quelles étapes pour un compte fraîchement créé ?
- [ ] Rôles : propriétaire vs employé vs responsable (guide §06, « Responsables »).
- [ ] Console admin (`/admin`) : quel garde de rôle ?
