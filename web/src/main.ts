import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { injectFonts } from './lib/fonts';
import { getLang } from './lib/i18n';

injectFonts(); // @font-face at runtime so URLs honor the Vite base path (works on GitHub Pages)
document.documentElement.lang = getLang(); // reflect current UI language on <html>


import { h } from './lib/dom';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { startRouter, type RenderFn } from './router';
import { PayloadsView } from './views/payloads';
import { ChecklistsView } from './views/checklists';
import { RevShellView } from './views/revshell';
import { BurpView } from './views/burp';
import { CommandsView } from './views/commands';
import { GtfobinsView } from './views/gtfobins';
import { ScriptsView } from './views/scripts';
import { ChainsView } from './views/chains';
import { OAuthLabView } from './views/oauthlab';
import { JwtLabView } from './views/jwtlab';
import { ReportsView } from './views/reports';
import { WordlistsView } from './views/wordlists';
import { NotesView } from './views/notes';
import { FavoritesView } from './views/favorites';
import { BackupView } from './views/backup';
import { EngageView } from './views/engage';
import { CyberChefView } from './views/cyberchef';
import { initPaletteHotkey } from './lib/palette';
import { initBackgroundFx } from './lib/particles';
import { api } from './api';

const appRoot = document.getElementById('app')!;

const sidebar = Sidebar();
const topbar = Topbar();
const outlet = h('div', { class: 'outlet' });
const main = h('main', { class: 'main' }, topbar.el, outlet);
appRoot.append(sidebar.el, main);

const routes: Record<string, RenderFn> = {
  payloads: PayloadsView,
  chains: ChainsView,
  oauthlab: OAuthLabView,
  jwtlab: JwtLabView,
  reports: ReportsView,
  checklists: ChecklistsView,
  revshell: RevShellView,
  burp: BurpView,
  commands: CommandsView,
  gtfobins: GtfobinsView,
  scripts: ScriptsView,
  wordlists: WordlistsView,
  cyberchef: CyberChefView,
  notes: NotesView,
  engage: EngageView,
  favorites: FavoritesView,
  backup: BackupView,
};

startRouter(outlet, routes, (name) => sidebar.setActive(name));
initPaletteHotkey();
initBackgroundFx();

api.stats().then((s) => topbar.setStat(s.total)).catch(() => { /* offline / server down */ });
