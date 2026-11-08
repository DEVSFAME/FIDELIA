# Spécifications Techniques & Squelette du Projet : Plateforme de Fidélité QR Code

## 1. Rôle et Objectif pour l'IA
Tu es un Architecte Logiciel et Développeur Full-Stack Senior spécialisé dans l'écosystème **Next.js (App Router), TypeScript, Tailwind CSS et Supabase**.
Ton objectif est de développer une application web progressive (PWA) de gestion de fidélité pour une boutique physique. Le système doit être fluide, rapide sur mobile, sécurisé et reposer sur des transactions atomiques en base de données.

---

## 2. Parcours Utilisateurs (User Flows)

### Flux A : Parcours Client (Friction minimale)
1. **Entrée :** Le client scanne un QR code statique affiché en boutique qui pointe vers `/join`.
2. **Onboarding :** Il arrive sur un formulaire demandant uniquement :
   - `Prénom` (Obligatoire)
   - `Nom` (Obligatoire)
   - `Email` (Facultatif)
3. **Création :** À la soumission, le système crée le profil client et génère une carte de fidélité associée à un `card_token` unique et sécurisé.
4. **Session & Dashboard :** Un token de session (cookie `httpOnly` longue durée + sauvegarde dans le `localStorage` en fallback) est créé pour que le client n'ait pas à se reconnecter. Il est redirigé vers `/card/[card_token]`.
5. **Affichage :** Le client voit sa carte de fidélité digitale avec :
   - Son nom et prénom.
   - Son solde de points en temps réel (via Supabase Realtime).
   - Son QR Code personnel généré dynamiquement (contenant son `card_token` ou l'URL `/admin/scan/[card_token]`).
   - L'historique de ses passages.

### Flux B : Parcours Commerçant / Staff (Sécurisé & Rapide)
1. **Authentification :** Le commerçant se connecte sur `/admin/login` (Authentification Supabase Auth classique par Email/Mot de passe ou code PIN).
2. **Scan :** Depuis `/admin/scanner`, le commerçant active la caméra de son smartphone directement dans le navigateur ou clique sur un client scanné via l'appareil photo natif qui redirige vers `/admin/scan/[card_token]`.
3. **Reconnaissance :** L'écran affiche instantanément :
   - L'identité du client (Prénom + Nom).
   - Son solde de points actuel.
4. **Saisie & Calcul :** Le commerçant entre le montant de la commande en Euros (ex: `24.50`). L'interface prévisualise immédiatement les points qui seront gagnés selon la règle métier (ex: $1\text{ €} = 1\text{ point}$, arrondi à l'entier inférieur ou supérieur selon configuration).
5. **Validation :** Au clic sur "Valider", une fonction RPC (Remote Procedure Call) PostgreSQL est exécutée pour enregistrer la transaction et incrémenter le solde de manière atomique (ACID).

---

## 3. Stack Technique Imposée
- **Framework :** Next.js 14+ (App Router, Server Actions & Route Handlers)
- **Langage :** TypeScript (Strict mode)
- **Styling & UI :** Tailwind CSS + Shadcn/UI + Lucide Icons (Mobile-first design)
- **Base de données & Auth :** Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Génération QR Code :** `qrcode.react` (Rendu SVG net côté client)
- **Lecteur QR Code :** `html5-qrcode` ou `@yudiel/react-qr-scanner` (Accès caméra navigateur pour le staff)
- **Validation des données :** `zod` + `react-hook-form`

---

## 4. Arborescence du Projet

```text
loyalty-platform/
├── public/
│   ├── manifest.json                 # Configuration PWA pour ajout à l'écran d'accueil
│   └── icons/                        # Icônes PWA
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Layout global (Polices, Providers, Toaster)
│   │   ├── page.tsx                  # Redirection vers /join ou /card/[token] si cookie présent
│   │   ├── (client)/                 # Groupe de routes Client
│   │   │   ├── join/
│   │   │   │   └── page.tsx          # Formulaire d'inscription rapide (Nom, Prénom, Email opt.)
│   │   │   └── card/
│   │   │       └── [token]/
│   │   │           └── page.tsx      # Dashboard client : Carte, QR Code, Points en temps réel
│   │   ├── (admin)/                  # Groupe de routes Commerçant (Protégé par Middleware)
│   │   │   ├── admin/
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx      # Connexion Staff/Commerçant
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx      # Vue d'ensemble : Stats, liste des clients, QR boutique
│   │   │   │   ├── scanner/
│   │   │   │   │   └── page.tsx      # Caméra intégrée pour scanner un client
│   │   │   │   └── scan/
│   │   │   │       └── [token]/
│   │   │   │           └── page.tsx  # Écran d'attribution des points après scan d'un client
│   │   └── api/
│   │       ├── client/
│   │       │   └── register/
│   │       │       └── route.ts      # Création client + génération carte + Set Cookie
│   │       └── loyalty/
│   │           └── add-points/
│   │               └── route.ts      # Endpoint sécurisé Staff pour créditer les points
│   ├── components/
│   │   ├── ui/                       # Composants Shadcn (Button, Input, Card, Toast, Dialog)
│   │   ├── client/
│   │   │   ├── OnboardingForm.tsx    # Formulaire client avec validation Zod
│   │   │   ├── LoyaltyCard.tsx       # Composant visuel de la carte avec QR Code (`qrcode.react`)
│   │   │   └── TransactionList.tsx   # Historique des points gagnés par le client
│   │   └── admin/
│   │       ├── QrScanner.tsx         # Lecteur caméra pour scanner le QR du client
│   │       ├── PointAllocator.tsx    # Calculateur Montant (€) -> Points + Validation
│   │       └── StoreQrPoster.tsx     # Générateur d'affiche QR Code pour la boutique (/join)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Client Supabase navigateur (pour le Realtime)
│   │   │   ├── server.ts             # Client Supabase serveur (Cookies & SSR)
│   │   │   └── admin.ts              # Client Supabase avec Service Role (pour actions critiques)
│   │   ├── rules/
│   │   │   └── loyalty-engine.ts     # Logique de calcul (ex: 1€ = 1pt, paliers de récompenses)
│   │   └── utils.ts                  # Helpers et fonctions utilitaires
│   ├── types/
│   │   └── database.types.ts         # Types TypeScript générés depuis le schéma Supabase
│   └── middleware.ts                 # Protection des routes /admin/* et redirection client
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql   # Script SQL complet (Tables, Index, RLS, Fonctions RPC)
├── .env.example
├── next.config.mjs
├── package.json
└── tsconfig.json
```

---

## 5. Schéma de Base de Données & Logique Transactionnelle (SQL)

Exécute ou génère ce script dans `supabase/migrations/0001_initial_schema.sql`. Il inclut les tables, la sécurité et la fonction transactionnelle atomique :

```sql
-- Extension pour générer des UUIDs et tokens cryptographiques
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Table des Clients
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table des Cartes de Fidélité
CREATE TABLE public.loyalty_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    card_token VARCHAR(64) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    current_points INTEGER NOT NULL DEFAULT 0 CHECK (current_points >= 0),
    total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_loyalty_cards_token ON public.loyalty_cards(card_token);

-- 3. Table de l'Historique des Transactions
CREATE TABLE public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
    amount_spent DECIMAL(10, 2) NOT NULL CHECK (amount_spent >= 0),
    points_delta INTEGER NOT NULL, -- Positif (gain) ou Négatif (récompense utilisée)
    staff_user_id UUID REFERENCES auth.users(id),
    notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Fonction RPC Atomique : Attribuer des points suite à un achat
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
    p_card_token VARCHAR,
    p_amount_spent DECIMAL,
    p_points_to_add INTEGER,
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_card_id UUID;
    v_new_balance INTEGER;
BEGIN
    -- Verrouiller la ligne de la carte pour éviter les race conditions (double scan simultané)
    SELECT id INTO v_card_id
    FROM public.loyalty_cards
    WHERE card_token = p_card_token
    FOR UPDATE;

    IF v_card_id IS NULL THEN
        RAISE EXCEPTION 'Carte de fidélité introuvable pour ce QR Code.';
    END IF;

    -- Insérer la transaction dans l'historique
    INSERT INTO public.loyalty_transactions (card_id, amount_spent, points_delta, staff_user_id)
    VALUES (v_card_id, p_amount_spent, p_points_to_add, p_staff_id);

    -- Mettre à jour le solde de la carte
    UPDATE public.loyalty_cards
    SET 
        current_points = current_points + p_points_to_add,
        total_spent = total_spent + p_amount_spent,
        updated_at = NOW()
    WHERE id = v_card_id
    RETURNING current_points INTO v_new_balance;

    RETURN jsonb_build_object(
        'success', true,
        'card_id', v_card_id,
        'new_balance', v_new_balance,
        'points_added', p_points_to_add
    );
END;
$$;

-- 5. Activation du Temps Réel (Realtime) sur la table loyalty_cards
ALTER PUBLICATION supabase_realtime ADD TABLE public.loyalty_cards;
```

---

## 6. Règles Métier et Spécifications Fonctionnelles

### A. Règle de Calcul des Points (`src/lib/rules/loyalty-engine.ts`)
Implémente une configuration centralisée et facilement modifiable :
- **Ratio par défaut :** $\text{Points} = \lfloor \text{Montant en €} \times \text{MULTIPLICATEUR} \rfloor$ (ex: avec un multiplicateur de $1$, une commande de $15,90\text{ €}$ donne $15\text{ points}$).
- Prévoir une fonction `calculatePointsFromAmount(amount: number): number`.

### B. Contenu du QR Code Client (`src/components/client/LoyaltyCard.tsx`)
- Le QR Code généré pour le client doit encoder l'URL complète d'administration :
  `${process.env.NEXT_PUBLIC_APP_URL}/admin/scan/${card.card_token}`
- **Pourquoi ?** Cela permet au commerçant d'utiliser soit le scanner intégré à l'application (`/admin/scanner`), soit directement l'application Appareil Photo native de son iPhone/Android qui ouvrira directement la page d'attribution des points du client concerné.

### C. Mise à Jour en Temps Réel côté Client
- Sur la page `/card/[token]`, abonne le composant aux changements Supabase Realtime de la ligne correspondant à `card_token`.
- Dès que le commerçant valide les points sur son téléphone, le compteur du client doit s'animer et afficher le nouveau solde instantanément sans que le client n'ait à rafraîchir sa page.

### D. Persistance de la Carte Client (Sans mot de passe)
- Comme l'email est facultatif, le client ne possède pas de mot de passe.
- Lors de la création de la carte :
  1. Enregistre un cookie `loyalty_card_token` avec une durée de vie de 400 jours.
  2. Sauvegarde également `loyalty_card_token` dans le `localStorage` du navigateur.
  3. Si le client retourne sur `/join` ou `/` avec le même téléphone, redirige-le automatiquement vers `/card/[token]`.
  4. Ajoute un bouton sur la carte : *"Sauvegarder mon lien personnel"* ou *"Ajouter à l'écran d'accueil"* (PWA).

---

## 7. Sécurité & Gestion des Erreurs
1. **Protection des routes Admin :** Le fichier `src/middleware.ts` doit vérifier la session Supabase Auth sur toutes les routes commençant par `/admin` (à l'exception de `/admin/login`) ainsi que sur l'API `/api/loyalty/add-points`. Si un client scanne le QR code d'un autre client, il est bloqué et redirigé vers la page de login commerçant.
2. **Idempotence & Anti-Double Clic :** Sur l'écran commerçant (`PointAllocator.tsx`), désactive immédiatement le bouton de validation pendant l'appel réseau (`isSubmitting`) pour éviter de créditer les points deux fois si le réseau de la boutique est lent.
3. **Validation Stricte :** Utilise `zod` côté serveur pour vérifier que le montant saisi est un nombre strictement positif ($\text{montant} > 0$) et inférieur à un plafond logique (ex: $< 10\,000\text{ €}$).

---

## 8. Plan d'Exécution Étape par Étape (Instructions pour l'IA)

Pour construire ce projet proprement, procède dans cet ordre exact :
1. **Étape 1 (Setup & DB) :** Initialise les fichiers de configuration, les clients Supabase (`client.ts`, `server.ts`, `admin.ts`), les types TypeScript et le fichier SQL de migration.
2. **Étape 2 (Moteur & API Client) :** Crée `loyalty-engine.ts`, la route API `/api/client/register` et les pages du flux client (`/join` et `/card/[token]` avec `qrcode.react` et Realtime).
3. **Étape 3 (Authentification & Middleware) :** Configure `middleware.ts` et la page `/admin/login`.
4. **Étape 4 (Flux Commerçant & Scanner) :** Développe le scanner (`/admin/scanner`), la page de réception du scan (`/admin/scan/[token]`) et la route API `/api/loyalty/add-points` appelant la fonction RPC `award_loyalty_points`.
5. **Étape 5 (Dashboard & Finitions PWA) :** Crée le tableau de bord `/admin/dashboard` (permettant aussi d'imprimer le premier QR Code de la boutique) et configure le `manifest.json`.