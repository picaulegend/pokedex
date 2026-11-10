export const loginSpriteIds = [1, 4, 7];

const landscape = `<svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">
<defs>
  <pattern id="kanto-stipple" width="4" height="4" patternUnits="userSpaceOnUse">
    <path fill="#49664e" d="M0 0h1v1H0zM2 2h1v1H2z"/>
  </pattern>
  <path id="kanto-pine" d="M5 0h2v3h2v3h2v3h2v3H8v3H5v-3H0V9h2V6h2V3h1z"/>
  <path id="kanto-grass" d="M0 1h1v1h1V0h1v2h1V1h1v2H0z"/>
</defs>

<path fill="#d9deba" d="M0 0h160v80H0z"/>
<path fill="#eee4b4" d="M123 7h10v2h4v3h3v4h2v9h-2v4h-3v3h-4v2h-10v-2h-4v-3h-3v-4h-2v-9h2v-4h3V9h4z"/>
<path fill="#eff0d3" d="M14 16h8v-2h12v2h7v2H14zM66 11h7V9h8v2h7v2H66zM101 26h9v2h-9z"/>

<path fill="#b3c4a0" d="M0 29h10v-3h9v-3h10v-3h12v3h10v4h11v4h12v-2h11v-5h11v-4h10v4h8v4h9v3h8v-4h8v-4h12v4h9v53H0z"/>
<path fill="#8fa985" d="M0 39h7v-3h10v-3h15v3h13v3h18v-2h15v-3h18v3h13v3h13v-2h10v-3h18v-4h10v49H0z"/>
<path fill="url(#kanto-stipple)" opacity=".45" d="M0 35h160v8H0z"/>
<path fill="#a6b98a" d="M0 48h16v-3h17v-3h27v2h23v-2h24v2h29v-3h24v39H0z"/>

<path fill="#c9c69b" d="M70 43h15v3h7v5h-4v4h-7v6h-1v5h10v4h17v4h11v6H61v-5h-9v-7h5v-6h10v-6h11v-6h2v-3H70z"/>
<path fill="#ded3aa" d="M68 64h8v5h6v4h11v3H69v-3h-7v-6h6z"/>
<path fill="#869d76" d="M125 55h23v3h12v21h-39v-3h-11v-4h-4v-7h7v-5h12z"/>
<path fill="#85a9a0" d="M128 58h20v3h12v15h-38v-3h-9v-4h-4v-3h8v-4h11z"/>
<path fill="#b7ccc0" d="M122 67h12v1h-12zM140 65h10v1h-10zM135 72h13v1h-13zM151 70h6v1h-6z"/>

<g fill="#607d60">
  <use href="#kanto-pine" x="2" y="31"/><use href="#kanto-pine" x="18" y="34"/>
  <use href="#kanto-pine" x="146" y="28"/><use href="#kanto-pine" x="136" y="36"/>
</g>
<g fill="#49664e">
  <use href="#kanto-pine" x="-5" y="38"/><use href="#kanto-pine" x="7" y="38"/>
  <use href="#kanto-pine" x="151" y="36"/>
</g>
<path fill="url(#kanto-stipple)" opacity=".5" d="M0 67h6v3h8v2h14v4h14v4H0zM150 47h10v9h-6v-4h-4z"/>
<g fill="#637f5c">
  <use href="#kanto-grass" x="12" y="57"/><use href="#kanto-grass" x="41" y="52"/>
  <use href="#kanto-grass" x="32" y="66"/><use href="#kanto-grass" x="49" y="72"/>
  <use href="#kanto-grass" x="100" y="53"/><use href="#kanto-grass" x="105" y="77"/>
</g>
<path fill="#eae4b8" d="M20 65h2v2h-2zM23 68h1v1h-1zM39 61h1v1h-1zM101 60h2v1h-2zM104 56h1v1h-1z"/>
<path fill="#718b67" opacity=".6" d="M21 55h10v1h3v2H18v-2h3zM74 57h13v1h2v2H71v-2h3z"/>
<path fill="#668d81" opacity=".7" d="M128 63h11v1h2v2h-15v-2h2z"/>
</svg>`;

export const loginArt = `<div class="login-landscape" role="img" aria-label="Bulbasaur, Charmander, and Squirtle in a Kanto landscape">
${landscape}
<div class="login-starters" aria-hidden="true">
${loginSpriteIds.map((id) => `<span class="login-sprite" data-pokemon="${id}"></span>`).join('')}
</div>
</div>`;
