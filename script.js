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

    /* --- downloads ---
       VERSIONS render newest-first as a selectable list. Each version carries
       its own build files, so older releases stay downloadable.

       Valid build keys - any you omit or leave blank simply doesn't render:
         windows-x64           windows-x64-portable
         macos-arm64           macos-x64
         linux-x64             linux-arm64          linux-portable

       Values are hrefs: a bare filename works if it sits next to index.html,
       or use a full https:// URL to a release host.

       All of these point at the Pre-release_v1.0 release of the public
       repository. The installers ask where they should put themselves - for
       this user only, or for everybody on the machine - so nothing needs an
       administrator password unless it is wanted. */
    versions: [
        {
            id: 'beta',
            channel: 'Beta',
            notes: 'The current beta of Crafted Resistance.',

            /* Download size per build key, shown under the button.
               Keep the keys in sync with builds below. */
            sizes: {
                'windows-x64': '159 MB',
                'windows-x64-portable': '176 MB',
                'macos-arm64': '163 MB',
                'macos-x64': '163 MB',
                'linux-portable': '165 MB',
            },

            builds: {
                // Windows — installer, then portable
                'windows-x64':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/Pre-release_v1.0/CraftedResistance-1.0.exe',

                'windows-x64-portable':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/Pre-release_v1.0/CraftedResistance-portable.zip',

                // macOS — disk image, then portable app bundle
                'macos-arm64':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/Pre-release_v1.0/CraftedResistance-1.0-macos-arm64.dmg',

                'macos-x64':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/Pre-release_v1.0/CraftedResistance-1.0-macos-x64.dmg',

                // Linux — AppImage bundle
                'linux-portable':
                    'https://github.com/Programmer7-dev/CraftedResistance/releases/download/Pre-release_v1.0/CraftedResistance-1.0-x86_64.AppImage',
            },
        },
    ],

    // --- still needed (leave blank until you have one) ---
    feedback: '',
    press: '',
};

/* the six pillars from "The Foundations of Survival" */
const PILLARS = ['Explore', 'Gather', 'Craft', 'Build', 'Survive', 'Expand'];

/* ---------- platform detection ----------
   Best-effort. The UA string is a lie on desktop (Chrome on Windows still says
   "Windows NT") and browsers narrow it over time, so treat this as a hint for
   UI copy only - never as a gate on a real download link. */
const PLATFORMS = {
    windows: { label: 'Windows', supported: true },
    mac: { label: 'macOS', supported: true },
    linux: { label: 'Linux', supported: true },
    android: { label: 'Android', supported: false },
    ios: { label: 'iOS / iPadOS', supported: false },
    unknown: { label: 'your device', supported: false },
};

function detectPlatform() {
    const ua = navigator.userAgent || '';
    const uaData = navigator.userAgentData;
    // Chromium's structured platform hint, where available
    const hint = (uaData && uaData.platform) || navigator.platform || '';
    // iPadOS 13+ deliberately masquerades as "MacIntel" with touch support
    const touchPoints = navigator.maxTouchPoints || 0;

    if (/android/i.test(hint) || /android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/mac/i.test(hint)) return touchPoints > 1 ? 'ios' : 'mac';
    if (/win/i.test(hint) || /windows/i.test(ua)) return 'windows';
    if (/macintosh|mac os/i.test(ua)) return 'mac';
    if (/linux|x11|cros/i.test(hint) || /linux|x11/i.test(ua)) return 'linux';

    return 'unknown';
}

const platformId = detectPlatform();
const platform = PLATFORMS[platformId];

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

/* ---------- platform-aware chrome ----------
   Marks the detected platform's card, shows an "unavailable on this device"
   notice for unsupported platforms, and hides the launch button where the
   craftedresistance:// protocol cannot exist. */
const SUPPORTED = ['windows', 'mac', 'linux'];

/* Maps a detected platform to the CONFIG.versions build-key prefix.
   'mac' -> 'macos-', 'linux' -> 'linux-' — keep these in sync with the
   build keys you actually publish. */
const BUILD_PREFIX = {
    windows: 'windows-',
    mac: 'macos-',
    linux: 'linux-',
};

// cards: badge the visitor's own platform
document.querySelectorAll('[data-matches]').forEach((card) => {
    if (card.dataset.matches === platformId) {
        card.classList.add('is-your-device');
        const badge = card.querySelector('.dl-card__yours');
        if (badge) badge.hidden = false;
    }
});

// downloads page banner + unavailable notice
const detected = document.getElementById('dl-detected');
const unsupported = document.getElementById('dl-unsupported');
const unsupportedText = document.getElementById('dl-unsupported-text');
const missing = document.getElementById('dl-missing');
const missingGrid = document.getElementById('dl-missing-grid');

// platforms we have no build for, in the order people ask about them
const NO_BUILD = [
    { id: 'android', icon: 'i-android', name: 'Android' },
    { id: 'ios', icon: 'i-apple', name: 'iOS / iPadOS' },
];

const NO_BUILD_COPY = {
    android: 'Crafted Resistance is a desktop game and there is no Android build.',
    ios: 'Crafted Resistance is a desktop game and there is no iOS or iPadOS build.',
    unknown: 'We could not detect your platform. Pick your platform below to get the right build.',
};

if (detected || unsupported) {
    const isSupported = SUPPORTED.includes(platformId);

    if (detected) {
        const text = detected.querySelector('.dl-detected__text');
        if (text) {
            text.textContent = isSupported
                ? `You're on ${platform.label} — your build is below.`
                : `You're on ${platform.label}.`;
        }
        detected.classList.toggle('dl-detected--warn', !isSupported);
        detected.hidden = false;
    }

    if (unsupported && !isSupported) {
        if (unsupportedText) unsupportedText.textContent = NO_BUILD_COPY[platformId] || NO_BUILD_COPY.unknown;
        unsupported.hidden = false;

        if (missing && missingGrid) {
            const list = platformId === 'unknown'
                ? NO_BUILD
                : [{ ...NO_BUILD.find((p) => p.id === platformId) }, ...NO_BUILD.filter((p) => p.id !== platformId)];

            missingGrid.innerHTML = list.filter(Boolean).map((p) => `
                <article class="dl-missing-card">
                    <span class="dl-missing-card__icon">
                        <svg class="icon" aria-hidden="true"><use href="#${p.icon}"></use></svg>
                    </span>
                    <h3>${p.name}</h3>
                    <p class="dl-missing-card__status">
                        <svg class="icon" aria-hidden="true"><use href="#i-check"></use></svg>
                        Not available
                    </p>
                </article>`).join('');

            missing.hidden = false;
        }
    }
}

// the launch protocol only exists on desktop
document.querySelectorAll('[data-link="play"]').forEach((btn) => {
    if (SUPPORTED.includes(platformId)) return;

    btn.classList.add('is-unavailable');
    btn.setAttribute('aria-disabled', 'true');
    btn.title = `The game launcher is not available on ${platform.label}`;
    btn.addEventListener('click', (e) => e.preventDefault());

    const label = btn.querySelector('[data-label]') || btn;
    const text = (label.textContent || '').trim();
    if (text === 'Play now') label.textContent = 'Play now (desktop only)';
});

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
            const isYourDevice = card.dataset.matches === platformId;

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
                const key = btn.dataset.download;
                const url = builds[key];
                const action = btn.closest('.dl-card__actions');

                // the visitor's own platform is never hidden - if they are on it,
                // showing an empty card is worse than showing nothing useful
                btn.hidden = !url && !isYourDevice;
                if (url) anyFile = true;

                btn.classList.toggle('is-primary', !!url || isYourDevice);

                const sizeEl = btn.querySelector('[data-size]');
                if (sizeEl) {
                    const size = (selected.sizes || {})[key];
                    sizeEl.textContent = size || '';
                    sizeEl.hidden = !size;
                }

                if (url) {
                    btn.href = url;
                    btn.title = `${url.split('/').pop()} — ${(selected.sizes || {})[key] || 'size unknown'}`;
                    btn.removeAttribute('aria-disabled');
                    btn.onclick = null;

                    if (/^https?:/i.test(url)) {
                        btn.target = '_blank';
                        btn.rel = 'noopener noreferrer';
                    } else {
                        btn.removeAttribute('target');
                        btn.removeAttribute('rel');
                    }
                } else if (isYourDevice) {
                    // their platform, but this version has no file for it
                    btn.classList.add('is-unavailable');
                    btn.setAttribute('aria-disabled', 'true');
                    btn.title = `No file for this platform in version ${(selected && selected.id) || ''}`;
                    btn.onclick = (e) => e.preventDefault();
                    btn.removeAttribute('target');
                    btn.removeAttribute('rel');
                }

                if (action) action.hidden = !card.querySelector('[data-download]:not([hidden])');
            });

            // a card with nothing to offer should say so, not just look empty
            const none = card.querySelector('[data-none]');
            if (none) {
                const actions = card.querySelector('.dl-card__actions');
                none.hidden = !actions || !actions.hidden;
            }
        });

        if (platformHint && selected) {
            const count = Object.keys((selected && selected.builds) || {}).filter((k) => selected.builds[k]).length;
            const mine = SUPPORTED.includes(platformId);
            const mineLabel = mine ? platform.label : null;

            let text = count
                ? `Downloads below are for version ${selected.id} — ${count} file(s) available.`
                : `Version ${selected.id} has no published files yet.`;

            if (mineLabel) {
                const prefix = BUILD_PREFIX[platformId];
                const hasMine = prefix
                    && Object.entries(selected.builds || {}).some(([key, val]) => val && key.startsWith(prefix));

                text += hasMine
                    ? ` Your ${mineLabel} build is highlighted.`
                    : ` There is no ${mineLabel} file for this version.`;
            }

            platformHint.textContent = text;
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
