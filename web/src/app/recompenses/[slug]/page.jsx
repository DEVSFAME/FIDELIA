import Link from 'next/link'
import { notFound } from 'next/navigation'

import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { programmePublic } from '@/lib/donnees.mjs'
import { normaliserSlug, prochainPalier, slugValide } from '@/lib/programme.mjs'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const { t } = pour(await localeRequete())
  const programme = await programmePublic(normaliserSlug(slug))
  return {
    title: programme.etat === 'ok' ? programme.donnees.nom : t('page.vitrine.titre'),
  }
}

/* Vitrine publique d'un programme — `/recompenses/<slug>`.
 *
 * Forme **mesurée** sur la cible : chunk `app/recompenses/%5Bslug%5D/page`,
 * 27 slugs publics au `sitemap.xml` (cf. `docs/architecture.md` §2). C'est la
 * page qu'un client ouvre quand il veut savoir *ce qu'il gagne* avant de
 * prendre la carte ; `/join/<slug>` est celle qu'il ouvre pour la prendre.
 *
 * Ce que cette page ne fait **pas**, et c'est le point :
 *   - elle ne crée aucune RPC. La donnée existe déjà — `programme_public` est
 *     accordée à `anon` dans `migrations/0003`, parce que c'est exactement la
 *     lecture d'une vitrine publique. Réécrire une seconde fonction pour le
 *     même `json` aurait doublé la surface à durcir ;
 *   - elle ne lit **aucune table** (`loyalty_programs`, `reward_tiers` sont sous
 *     RLS sans politique : un SELECT direct rendrait `[]`, donc « pas de
 *     programme » — un mensonge, cf. `lib/donnees.mjs`) ;
 *   - elle ne touche pas au mapping prénom / nom : une vitrine ne montre aucune
 *     personne, donc elle n'a aucune raison d'importer `lib/personne.mjs`.
 *
 * Aucune redirection vers `/login` : le client final n'a pas de compte.
 */
export default async function PageVitrine({ params }) {
  const { slug: saisi } = await params
  const locale = await localeRequete()
  const { t } = pour(locale)

  /* La validation locale est une défense en profondeur, pas la règle : c'est
     `programme_public` qui décide (`lower(trim(p_slug))`, puis
     `PROGRAM_NOT_FOUND`). On évite seulement d'envoyer au réseau une valeur
     qui ne peut pas être un slug — et on rend le même 404 qu'un slug inconnu,
     pour qu'une URL mal orthographiée ne se distingue pas d'une URL disparue. */
  const slug = normaliserSlug(saisi)
  if (!slugValide(slug)) notFound()

  const programme = await programmePublic(slug)

  /* Slug inconnu -> 404. `programme_public` lève `PROGRAM_NOT_FOUND`, que
     `donnees.mjs` traduit en `refuse`. Une page publique partagée qui ne
     correspond à rien doit se comporter comme une page absente, pas comme une
     panne : même choix que `/join/<slug>`, même code de retour. */
  if (programme.etat === 'refuse') notFound()

  if (programme.etat !== 'ok') {
    /* Trois causes distinctes, trois textes — jamais « ce programme n'existe
       pas » quand la vérité est « la fonction n'est pas dans la base ». */
    const migration = programme.etat === 'nonMigre' || programme.etat === 'configuration'
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">{t('page.vitrine.titre')}</h1>
        <p className="mt-3 text-sm leading-relaxed opacity-75">
          {migration ? t('tableau.etat.migrationTexte') : t('tableau.etat.refus')}
        </p>
        {migration ? (
          <code className="mt-4 block break-words rounded-xl border border-white/15 px-3 py-2 font-mono text-xs opacity-80">
            migrations/0003_r3_programme_join_lecture.sql
          </code>
        ) : null}
      </main>
    )
  }

  const { nom, paliers } = programme.donnees
  /* `paliers` vient d'un `json_agg`, donc d'une base : on ne suppose pas sa
     forme. Un `null` (programme sans palier) et un tableau vide se lisent
     pareil ici, et `prochainPalier` sait déjà écarter un coût invalide. */
  const liste = Array.isArray(paliers) ? paliers : []

  /* L'accroche est le **premier** palier — « 45 points = Boisson offerte »,
     la phrase relevée sur la cible. `prochainPalier(0, …)` la donne sans
     ajouter de fonction : il trie par coût, ignore les coûts non entiers ou
     nuls, et rend `null` sur une liste vide. Un solde de 0 est le bon point de
     départ : cette page n'a pas de solde, elle montre le barème. */
  const accroche = prochainPalier(0, liste)

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-55">
        {t('page.vitrine.surtitre')}
      </p>
      <h1 className="mt-2 font-impact text-4xl leading-tight tracking-tight">{nom}</h1>

      {accroche ? (
        <p className="mt-3 text-sm font-semibold">
          {t('page.vitrine.accroche', { points: accroche.cout, libelle: accroche.libelle })}
        </p>
      ) : null}

      {liste.length > 0 ? (
        <ol className="mt-8 grid gap-4">
          {liste.map((palier) => (
            <li key={palier.rang} className="border-b border-white/10 pb-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold">
                  {/* Le rang est **affiché** et non décoratif : la cible le rend
                      (« 1 Boisson offerte »), et c'est ce qui donne l'ordre de
                      progression au client. */}
                  <span className="mr-2 font-mono text-xs opacity-50">{palier.rang}</span>
                  {palier.libelle}
                </span>
                <span className="font-mono text-sm opacity-75">{palier.cout} pts</span>
              </div>
              {palier.description ? (
                <p className="mt-1 text-xs leading-relaxed opacity-60">{palier.description}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-8 text-sm leading-relaxed opacity-70">
          {t('page.vitrine.sansPaliers')}
        </p>
      )}

      {/* Le seul appel à l'action possible : `/join/<slug>`, la route que le QR
          du comptoir encode déjà (`lib/qr.mjs`, `urlAdhesion`). On réutilise
          cette page au lieu d'en créer une seconde — un client qui a vu le
          barème n'a plus qu'un geste à faire, et c'est celui du QR. */}
      <Link
        href={`/join/${slug}`}
        className="mt-10 flex h-[3.25rem] w-full items-center justify-center rounded-xl bg-ink text-base font-bold text-white transition-all active:scale-95"
      >
        {t('page.vitrine.action')}
      </Link>
    </main>
  )
}
