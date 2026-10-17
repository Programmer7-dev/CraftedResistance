/* ============================================================
   Crafted Resistance — site behaviour
   - outbound links live in CONFIG below
   - mobile nav, sticky nav state, scroll-spy
   - scroll reveals, pillar ticker, FAQ accordion
   ============================================================ */

/* ------------------------------------------------------------
   CONFIG — replace these with your real URLs
   ------------------------------------------------------------ */
const CONFIG = {
    // --- live ---
    play: 'craftedresistance://play',
    discord: 'https://discord.gg/Ker5hu4NG',

    /* --- downloads --- */
    versions: [
        {
            id: '1.0-beta',
            channel: 'Beta',
            notes: 'First public beta release of Crafted Resistance.',
            builds: {
                'windows-x64':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/1.0-beta/CraftedResistance-1.0-beta.exe',

                'windows-x64-portable':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/1.0-beta/CraftedResistance-portable-1.0-beta.zip',
            },
        },
    ],

    // --- still needed (leave blank until you have one) ---
    feedback: '',
    privacy: '',
    terms: '',
    press: '',
};

/* the six pillars from "The Foundations of Survival" */
const PILLARS = ['Explore', 'Gather', 'Craft', 'Build', 'Survive', 'Expand'];

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- outbound links ---------- */
document.querySelectorAll('[data-link]').forEach((el) => {
    const url = CONFIG[el.dataset.link];

    if (!url) {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.title = `Set CONFIG.${el.dataset.link} in script.js to link this`;
        el.addEventListener('click', (e) => e.preventDefault());
        return;
    }

    el.href = url;

    // Web links open in a new tab. Custom protocol links (craftedresistance://)
    // must NOT - a new browsing context stops the OS protocol handler firing.
    if (/^https?:/i.test(url)) {
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
    }
});

/* ---------- footer year ---------- */
document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
});

/* ---------- mobile nav ---------- */
const body = document.body;
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
const navScrim = document.getElementById('nav-scrim');

function setNav(open) {
    body.classList.toggle('nav-open', open);
    if (navToggle) {
        navToggle.setAttribute('aria-expanded', String(open));
        navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    if (navScrim) navScrim.hidden = !open;
}

if (navToggle) {
    navToggle.addEventListener('click', () => setNav(!body.classList.contains('nav-open')));
}

if (navScrim) {
    navScrim.addEventListener('click', () => setNav(false));
}

navLinks?.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');

    if (link) {
        const id = link.getAttribute('href').slice(1);
        if (spyLinks.has(id)) setSpy(id);
    }

    setNav(false);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.classList.contains('nav-open')) {
        setNav(false);
        navToggle?.focus();
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 860 && body.classList.contains('nav-open')) setNav(false);
});

/* ---------- sticky nav state ---------- */
const nav = document.getElementById('nav');
const toTop = document.getElementById('to-top');

function onScroll() {
    const y = window.scrollY;
    nav?.classList.toggle('is-stuck', y > 8);
    if (toTop) toTop.hidden = y < 600;
    updateSpy();
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', updateSpy, { passive: true });

toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
});

/* ---------- scroll-spy ----------
   The active link is the last section whose top has passed the line a third of
   the way down the viewport. A thin IntersectionObserver band proved unreliable
   on jump-scrolling, so this reads layout positions instead. */
const spyTargets = [...document.querySelectorAll('main section[id]')];
const spyLinks = new Map();

document.querySelectorAll('.nav__links a[href^="#"]').forEach((link) => {
    const id = link.getAttribute('href').slice(1);
    if (document.getElementById(id)) spyLinks.set(id, link);
});

let lastSpySection = null;

function setSpy(current) {
    lastSpySection = current;

    spyLinks.forEach((link, id) => {
        const active = id === current;
        link.classList.toggle('is-active', active);

        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
    });
}

function updateSpy() {
    // the active link is the last section whose top has passed a third of the way
    // down the viewport
    const line = window.scrollY + window.innerHeight / 3;
    let current = null;

    spyTargets.forEach((section) => {
        if (section.offsetTop <= line) current = section.id;
    });

    if (current === lastSpySection) return;
    setSpy(current);
}

/* ---------- scroll reveals ---------- */
const revealables = document.querySelectorAll('[data-reveal]');

// stagger siblings slightly so grids cascade instead of popping
document.querySelectorAll('.grid, .faq').forEach((group) => {
    [...group.children].forEach((child, i) => {
        if (child.hasAttribute('data-reveal')) {
            child.style.setProperty('--delay', `${Math.min(i, 5) * 80}ms`);
        }
    });
});

if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-visible'));
} else {
    const reveal = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    revealables.forEach((el) => reveal.observe(el));
}

/* ---------- pillar ticker ---------- */
const track = document.querySelector('[data-ticker-track]');

if (track) {
    // the track holds exactly two identical runs, then slides -50% for a seamless loop
    const makeRun = (hidden) => {        const run = document.createElement('div');
        run.className = 'ticker__run';

        if (hidden) run.setAttribute('aria-hidden', 'true');

        PILLARS.forEach((word) => {
            const item = document.createElement('span');
            item.className = 'ticker__item';
            item.textContent = word;
            run.appendChild(item);
        });

        return run;
    };

    if (prefersReducedMotion) {
        track.classList.add('ticker__track--static');
        track.appendChild(makeRun(false));
    } else {
        track.append(makeRun(false), makeRun(true));
    }
}

/* initial paint state (after updateSpy is defined) */
onScroll();

/* ---------- downloads page ----------
   Step 1: render CONFIG.versions as a selectable list.
   Step 2: platform buttons read the selected version's build files.
   Build keys in CONFIG that the page does not know about are ignored, and
   platform buttons with no file in the selected version are hidden. */
const versionList = document.getElementById('version-list');
const dlNotice = document.getElementById('dl-notice');
const platformHint = document.getElementById('platform-for-version');

if (versionList) {
    const versions = Array.isArray(CONFIG.versions) ? CONFIG.versions : [];
    let selected = null;

    const buildKeysOf = (v) => Object.keys(v.builds || {}).filter((k) => v.builds[k]);

    if (!versions.length) {
        versionList.classList.add('versions--empty');
        versionList.innerHTML =
            '<p class="versions__placeholder">No versions published yet. Add them to ' +
            '<code>CONFIG.versions</code> in <code>script.js</code>.</p>';
        if (dlNotice) dlNotice.hidden = false;
    } else {
        versions.forEach((version, index) => {
            const files = buildKeysOf(version);
            const card = document.createElement('article');
            card.className = 'version';
            card.dataset.version = version.id;
            card.dataset.index = String(index);

            const channel = (version.channel || '').trim();

            card.innerHTML = `
                <div class="version__main">
                    <div class="version__top">
                        <h3 class="version__id"></h3>
                        ${channel ? '<span class="chip version__channel"></span>' : ''}
                        ${index === 0 ? '<span class="chip chip--next version__latest">Latest</span>' : ''}
                    </div>
                    <p class="version__notes"></p>
                    <p class="version__files"><strong></strong> <span></span> file(s) available</p>
                </div>
                <button class="btn version__pick" type="button" aria-pressed="false">
                    <span class="version__pick-label">Select</span>
                </button>`;

            card.querySelector('.version__id').textContent = version.id;
            if (channel) card.querySelector('.version__channel').textContent = channel;
            if (version.notes) card.querySelector('.version__notes').textContent = version.notes;
            card.querySelector('.version__files strong').textContent = String(files.length);

            card.querySelector('.version__pick').addEventListener('click', () => {
                selected = version;
                paintVersions();
                paintPlatforms();
            });

            versionList.appendChild(card);
        });

        // preselect the newest version
        selected = versions[0];
    }

    function paintVersions() {
        versionList.querySelectorAll('.version').forEach((card) => {
            const isOn = card.dataset.index === String(versions.indexOf(selected));
            card.classList.toggle('is-selected', isOn);
            card.querySelector('.version__pick').setAttribute('aria-pressed', String(isOn));
            card.querySelector('.version__pick-label').textContent = isOn ? 'Selected' : 'Select';
        });
    }

    function paintPlatforms() {
        let anyFile = false;

        document.querySelectorAll('.dl-card').forEach((card) => {
            const builds = (selected && selected.builds) || {};

            ['version', 'channel'].forEach((field) => {
                const row = card.querySelector(`[data-row="${field}"]`);
                const cell = card.querySelector(`[data-field="${field}"]`);
                if (!row || !cell) return;

                const value = field === 'version'
                    ? (selected && selected.id) || ''
                    : ((selected && selected.channel) || '').trim();

                cell.textContent = value;
                row.hidden = !value;
            });

            // hide platform buttons that have no file in the selected version
            card.querySelectorAll('[data-download]').forEach((btn) => {
                const url = builds[btn.dataset.download];
                const action = btn.closest('.dl-card__actions');

                btn.hidden = !url;
                if (url) anyFile = true;

                btn.classList.remove('is-unavailable');
                btn.classList.toggle('is-primary', !!url);

                if (url) {
                    btn.href = url;
                    btn.title = url;
                    btn.removeAttribute('aria-disabled');
                    btn.onclick = null;

                    if (/^https?:/i.test(url)) {
                        btn.target = '_blank';
                        btn.rel = 'noopener noreferrer';
                    } else {
                        btn.removeAttribute('target');
                        btn.removeAttribute('rel');
                    }
                } else {
                    // keep the slot visible only if this platform has files at all
                    btn.hidden = true;
                }

                if (action) action.hidden = !card.querySelector('[data-download]:not([hidden])');
            });
        });

        if (platformHint && selected) {
            const count = Object.keys((selected && selected.builds) || {}).filter((k) => selected.builds[k]).length;
            platformHint.textContent = count
                ? `Downloads below are for version ${selected.id} — ${count} file(s) available.`
                : `Version ${selected.id} has no published files yet.`;
        }

        if (dlNotice) dlNotice.hidden = anyFile;
    }

    paintVersions();
    paintPlatforms();
}

/* ---------- FAQ: one open at a time ---------- */
document.querySelectorAll('[data-faq] details').forEach((item) => {
    item.addEventListener('toggle', () => {
        if (!item.open) return;
        document.querySelectorAll('[data-faq] details').forEach((other) => {
            if (other !== item) other.open = false;
        });
    });
});
