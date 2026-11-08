import { prochainPalier, progression } from '@/lib/programme.mjs'

/* Solde et progression vers la prochaine récompense.
 *
 * Deux informations, dans cet ordre : le solde (le fait) puis ce qu'il reste à
 * faire (l'action). Un écran de caisse qui n'affiche que « 12 points » oblige le
 * commerçant à calculer de tête s'il peut offrir quelque chose.
 *
 * `aria-valuenow` est posé sur la barre : sans lui, un lecteur d'écran annonce
 * « barre de progression » sans valeur, ce qui est pire que rien.
 *
 * **Habillage repris le 2026-11-01.** Le composant utilisait `bg-coral` et
 * `bg-white/10` — les utilitaires de la palette « verre », retirée par la
 * refonte Unicity. Sur une carte claire, la piste `white/10` était *invisible*
 * et le remplissage orange jurait avec l'accent bleu. Pire : `font-impact`
 * tombait sur une police système si le jeton n'était pas chargé. Les classes
 * `uc-solde` / `uc-jauge` sont dans `unicity.css`, comme le reste de la peau —
 * un composant ne doit pas dépendre d'utilitaires d'une palette morte.
 */
export function JaugePoints({ points, paliers, libelleProchain, libelleAucun }) {
  const suivant = prochainPalier(points, paliers)
  const part = suivant ? progression(points, suivant.cout) : 1
  const pourcent = Math.round(part * 100)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="uc-solde">
          <span className="uc-solde-val">{points}</span>
          <span className="uc-solde-unite">pts</span>
        </p>
        <p className="text-xs font-semibold opacity-60">{libelleProchain}</p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcent}
        className="uc-jauge"
      >
        <div className="uc-jauge-remplie" style={{ width: `${pourcent}%` }} />
      </div>

      <p className="mt-2 text-sm opacity-75">
        {suivant ? `${suivant.libelle} · ${suivant.reste} pts` : libelleAucun}
      </p>
    </div>
  )
}
