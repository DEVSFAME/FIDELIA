/** @type {import('tailwindcss').Config} */
const config = {
  content: ['./src/**/*.{js,mjs,jsx}'],
  // Le mode sombre passe par la classe `.dark`, comme la cible (`[data-skin=premium].dark`).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Palette de marque : valeurs brutes mesurées (tokens.css)
        coral: 'rgb(var(--coral-rgb) / <alpha-value>)',
        'coral-dark': 'rgb(var(--coral-dark-rgb) / <alpha-value>)',
        'coral-light': 'rgb(var(--coral-light-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        page: 'var(--fond-page)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Les familles sont mesurées ; les binaires sont transcrits dans
      // `polices.css`. Les piles ci-dessous reprennent la **chaîne exacte** des
      // classes correspondantes de la cible, par exemple :
      //   .font-impact{font-family:var(--font-impact),var(--font-display),sans-serif}
      // `var(--font-impact)` seul tomberait sur une police système sans que rien
      // ne le signale.
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
        script: ['var(--font-script)', 'cursive'],
        mono: ['var(--font-mono)', 'monospace'],
        impact: ['var(--font-impact)', 'var(--font-display)', 'sans-serif'],
      },
    },
  },
  plugins: [
    // Variantes `rtl:` / `ltr:` — la cible les compile en
    // `:where([dir=rtl],[dir=rtl] *)`. On reproduit cette forme exacte plutôt
    // que d'ajouter une dépendance pour deux sélecteurs.
    ({ addVariant }) => {
      addVariant('rtl', '&:where([dir=rtl], [dir=rtl] *)')
      addVariant('ltr', '&:where([dir=ltr], [dir=ltr] *)')
    },
  ],
}

export default config
