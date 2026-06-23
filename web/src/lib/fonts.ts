// Inject @font-face at runtime so font URLs honor the Vite base path. A static
// `url(/fonts/…)` in CSS is NOT rebased by Vite, so it 404s under base '/Arsenal/'
// on GitHub Pages. Building the rules here with import.meta.env.BASE_URL works for
// both the server build (base '/') and the Pages build (base '/Arsenal/').
// Fonts live in web/public/fonts/ (single source; the CyberChef iframe uses them too).
const B = import.meta.env.BASE_URL;

const R = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  ext: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  cyr: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
};
const face = (family: string, weight: number, file: string, range: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${B}fonts/${file}) format('woff2');unicode-range:${range};}`;
// Open Sans: latin htf_0, latin-ext htf_3, cyrillic htf_6 (same files across weights)
const os = (w: number) => face('Open Sans', w, 'htf_0.woff2', R.latin) + face('Open Sans', w, 'htf_3.woff2', R.ext) + face('Open Sans', w, 'htf_6.woff2', R.cyr);
// Source Code Pro: latin htf_15, latin-ext htf_10, cyrillic htf_14
const scp = (w: number) => face('Source Code Pro', w, 'htf_15.woff2', R.latin) + face('Source Code Pro', w, 'htf_10.woff2', R.ext) + face('Source Code Pro', w, 'htf_14.woff2', R.cyr);

export function injectFonts(): void {
  if (document.getElementById('ars-fonts')) return;
  const s = document.createElement('style');
  s.id = 'ars-fonts';
  s.textContent = os(400) + os(600) + os(700) + scp(400) + scp(600);
  document.head.appendChild(s);
}
