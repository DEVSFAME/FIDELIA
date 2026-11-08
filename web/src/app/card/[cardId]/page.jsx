import { cache } from 'react'
import { notFound } from 'next/navigation'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { cartePublique } from '@/lib/donnees.mjs'
import { identifiantCarteValide, lireCartePublique } from '@/lib/carte-publique.mjs'
import { prochainPalier } from '@/lib/programme.mjs'
import { lireConfiguration } from '@/lib/google-wallet.mjs'
import { QrCode } from '@/components/tableau/QrCode'
import { ActiverNotifications } from '@/components/carte/ActiverNotifications'

/* La carte du client — `/card/<cardId>`, **publique**.

   Mesuré (`_captures/2026-10-27-a3/mesure-a3.json`) : anonyme, sans cookie,

       GET /card/<uuid_carte>   200   56 043 o   « Carte fidélité — <commerce> »
       GET /card/test           404
       GET /card/<uuid nul>     404

   Trois décisions, toutes dictées par cette mesure :

   1. **la clé est l'UUID**, jamais le code. `/join` avait refusé une URL
      `/card/<code>` parce qu'un code court est un oracle énumérable ; l'UUID ne
      l'est pas, et il circule déjà dans les liens Wallet. Le code reste
      l'identifiant de **scan**, affiché ici en clair et en QR — c'est ce que la
      cible fait (« Le QR code sur la carte est votre identifiant unique ») ;
   2. **un UUID inconnu rend un 404**, pas une page d'erreur : c'est le
      comportement mesuré, et une URL mal orthographiée ne doit pas se
      distinguer d'une carte disparue ;
   3. **aucune redirection vers `/login`** : le client final n'a pas de compte.

   Ce que cette page ne fait **pas**, et qui est le point de tout le dossier :
   elle ne promet aucune notification « à proximité ». Le bloc de notifications
   sert les **messages du commerçant** ; la proximité est un géorepérage inscrit
   dans le pass Wallet, conditionné à « il faut que la carte soit dans leur
   wallet ». Une phrase le dit au client en bas de page, et elle n'est pas
   décorative : c'est la seule chose qui empêche de lire ce bouton comme
   « prévenez-moi quand je passe devant ».

   `force-dynamic` : la page rend un **solde**. Une version prérendue ou mise en
   cache servirait un solde périmé à un client venu vérifier ses points.
   `robots: noindex` : l'URL est personnelle ; une page indexée publierait des
   codes clients dans un moteur de recherche. Ce n'est pas mesuré sur la cible
   (`[?]`), c'est notre décision.
 */

export const dynamic = 'force-dynamic'

/* `cartePublique` est appelée deux fois par requête (métadonnées + rendu).
   `cache()` de React déduplique **à l'échelle de la requête** : un seul
   aller-retour Supabase, qui coûte 0,55 à 0,81 s ici (`lib/cache.mjs`). */
const lireCarte = cache(cartePublique)

const SANS_INDEX = { index: false, follow: false }

export async function generateMetadata({ params }) {
  const { cardId } = await params
  const { t } = pour(await localeRequete())

  if (!identifiantCarteValide(cardId)) {
    return { title: t('page.carte.titre'), robots: SANS_INDEX }
  }

  const lecture = await lireCarte(cardId)
  const carte = lecture.etat === 'ok' ? lireCartePublique(lecture.donnees) : null

  return {
    title: carte
      ? t('page.carte.metaTitre', { commerce: carte.nomCommerce })
      : t('page.carte.titre'),
    robots: SANS_INDEX,
  }
}

/** L'écran des trois cas où la carte ne peut pas s'afficher — un texte par cause. */
function EcranIndisponible({ t, migration }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">{t('page.carte.titre')}</h1>
      <p className="mt-3 text-sm leading-relaxed opacity-75">
        {migration ? t('tableau.etat.migrationTexte') : t('tableau.etat.refus')}
      </p>
      {migration ? (
        <code className="mt-4 block break-words rounded-xl border border-white/15 px-3 py-2 font-mono text-xs opacity-80">
          migrations/0018_carte_publique.sql
        </code>
      ) : null}
    </main>
  )
}

export default async function PageCarte({ params }) {
  const { cardId } = await params
  const locale = await localeRequete()
  const { t } = pour(locale)

  /* Défense en profondeur, pas la règle : c'est `carte_publique(uuid)` qui
     décide. On évite seulement d'envoyer au réseau une chaîne que PostgreSQL
     refuserait en `22P02` — un code que `donnees.mjs` traduirait en
     « la base ne répond pas » pour une URL simplement mal orthographiée. */
  if (!identifiantCarteValide(cardId)) notFound()

  const lecture = await lireCarte(cardId)

  if (lecture.etat === 'introuvable' || lecture.etat === 'refuse') notFound()

  if (lecture.etat !== 'ok') {
    const migration = lecture.etat === 'nonMigre' || lecture.etat === 'configuration'
    return <EcranIndisponible t={t} migration={migration} />
  }

  const carte = lireCartePublique(lecture.donnees)
  /* `null` = la fonction a répondu autre chose que ce qu'elle promet. Ce n'est
     ni « carte inconnue » ni « migration à passer » : l'écran le dit avec le
     texte des pannes, et ne fabrique pas une carte à moitié vide. */
  if (!carte) return <EcranIndisponible t={t} migration={false} />

  const suivant = prochainPalier(carte.points, carte.paliers)

  /* Le bouton Google Wallet n'apparaît que si le canal est branché **et**
     entièrement configuré (`lireConfiguration`) : un bouton qui mène à un 503
     est pire qu'un bouton absent. Apple n'a pas de route ici — `0014` l'explique,
     et la ligne 5 du rapport (§7) reste ouverte. */
  const walletPret = lireConfiguration(process.env).pret

  /* La clé VAPID est lue **côté serveur** et passée en prop : le composant
     client n'accède pas à `process.env`, et une clé vide y arrive comme vide. */
  const clePublique = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
        {t('page.carte.surtitre')}
      </p>
      <h1 className="mt-2 text-center font-impact text-3xl uppercase leading-none tracking-tight">
        {carte.nomCommerce}
      </h1>
      {carte.prenom ? (
        <p className="mt-2 text-sm opacity-70">
          {t('page.carte.bonjour', { prenom: carte.prenom })}
        </p>
      ) : null}

      <section className="mt-8 w-full max-w-sm rounded-2xl border border-white/15 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-impact text-4xl leading-none">{carte.points}</span>
          <span className="text-xs font-semibold uppercase tracking-wide opacity-55">
            {t('page.carte.points')}
          </span>
        </div>

        {suivant ? (
          <p className="mt-3 text-sm leading-relaxed opacity-80">
            {t('page.carte.prochain', { reste: suivant.reste, libelle: suivant.libelle })}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed opacity-80">
            {t('page.carte.toutAtteint')}
          </p>
        )}

        {/* Le QR encode **le code**, comme le fait `/join` : c'est exactement ce
            que lit le scanner du comptoir. Encoder l'URL de cette page ferait
            scanner une URL là où la caisse attend un jeton. */}
        <div className="mt-5 flex flex-col items-center">
          <QrCode texte={carte.code} taille={180} />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-55">
            {t('page.carte.code')}
          </p>
          <p className="mt-1 font-mono text-lg tracking-[0.15em]">{carte.code}</p>
        </div>

        {carte.depuis ? (
          <p className="mt-4 text-center text-xs opacity-60">
            {t('page.carte.depuis', { date: carte.depuis })}
          </p>
        ) : null}
      </section>

      <ActiverNotifications
        cardId={carte.id}
        nomCommerce={carte.nomCommerce}
        clePublique={clePublique}
        locale={locale}
      />

      {walletPret ? (
        <section className="mt-6 w-full max-w-sm">
          <p className="text-center text-xs font-semibold uppercase tracking-wide opacity-55">
            {t('page.carte.wallet')}
          </p>
          <a
            href={`/api/wallet/google/${carte.code}`}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-ink text-sm font-bold text-white transition-all active:scale-95"
          >
            {t('page.carte.walletGoogle')}
          </a>
        </section>
      ) : null}

      <p className="mt-8 text-center text-xs leading-relaxed opacity-55">
        {t('page.carte.proximite')}
      </p>
      <p className="mt-2 text-center text-xs leading-relaxed opacity-55">
        {t('page.carte.garder')}
      </p>
    </main>
  )
}

