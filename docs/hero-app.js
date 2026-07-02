/* ============================================================
   Interactive hero simulation — mock data, no network calls.
   Starts when the hero scrolls into view, pauses when hidden.
   ============================================================ */
(function () {
  const app = document.getElementById('fleet-app');
  if (!app) return;

  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- scale to fit (image-like, no reflow) ---------------- */
  const scaleWrap = $('fa-scale');
  const DESIGN_W = 1072;
  function fit() {
    app.style.transform = 'scale(' + scaleWrap.clientWidth / DESIGN_W + ')';
  }
  fit();
  new ResizeObserver(fit).observe(scaleWrap);

  /* ---------------- tabs ---------------- */
  const tabs = app.querySelectorAll('.fa-tabs button[data-view]');
  const panes = app.querySelectorAll('.fa-view');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('on', x === t));
      panes.forEach((p) => p.classList.toggle('on', p.dataset.pane === t.dataset.view));
    })
  );

  /* ---------------- chart ---------------- */
  const chartEl = $('fa-chart');
  const days = ['18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '1'];
  const heights = [22, 35, 18, 48, 40, 12, 8, 55, 42, 60, 38, 52, 68, 46];
  const bars = heights.map((h, i) => {
    const bar = document.createElement('div');
    bar.className = 'fa-bar' + (i === heights.length - 1 ? ' today' : '');
    bar.innerHTML = '<u></u><span>' + (i === heights.length - 1 ? 'Jul 1' : 'Jun ' + days[i]) + '</span>';
    chartEl.appendChild(bar);
    return bar.firstChild;
  });
  let todayHeight = heights[heights.length - 1];

  /* ---------------- fleet status ---------------- */
  const AGENTS = [
    { name: 'fleet-orchestrator', sub: 'manages the fleet · 1 task', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
    { name: 'odp-product-manager', sub: 'next: jira-digest in 2h', icon: 'M4 7h16v13H4zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2' },
    { name: 'task-manager', sub: 'next: prioritize in 4h', icon: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2' },
    { name: 'vault-librarian', sub: 'next: organize on Sun', icon: 'M4 19V5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM19 17H6' },
    { name: 'site-monitor', sub: 'heartbeat · every 6h', icon: 'M22 12h-4l-3 8L9 4l-3 8H2' },
  ];
  const fleetEl = $('fa-fleet');
  const fleetDots = {};
  AGENTS.forEach((a) => {
    const row = document.createElement('div');
    row.className = 'fa-agent-row';
    row.innerHTML =
      '<span class="fa-agent-ic"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="' + a.icon + '"/></svg></span>' +
      '<span class="fa-agent-body"><span class="fa-agent-name">' + a.name + '</span><br><span class="fa-agent-sub">' + a.sub + '</span></span>' +
      '<i class="fa-dot green"></i>';
    fleetEl.appendChild(row);
    fleetDots[a.name] = row.querySelector('.fa-dot');
  });

  /* ---------------- agents view ---------------- */
  const CARDS = [
    ['fleet-orchestrator', 'Manages the fleet — creates agents, tasks, skills, and channels on request.', 'claude', 'opus'],
    ['odp-product-manager', 'Writes Jira and Slack digests into your daily notes every morning.', 'claude', 'sonnet'],
    ['task-manager', 'Prioritizes and schedules tasks from your inbox and calendar signals.', 'claude', 'sonnet'],
    ['vault-librarian', 'Files, links, and dedups notes across the vault every week.', 'codex', 'gpt-5.5-codex'],
    ['site-monitor', 'Uptime checks with memory of past incidents. Posts anomalies to Slack.', 'claude', 'haiku'],
  ];
  const gridEl = $('fa-agent-grid');
  CARDS.forEach(([name, desc, adapter, model], i) => {
    const el = document.createElement('div');
    el.className = 'fa-agent-card';
    el.innerHTML =
      '<div class="head"><span class="fa-agent-ic"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="' + AGENTS[i].icon + '"/></svg></span>' +
      '<span class="fa-agent-name">' + name + '</span><i class="fa-dot green"></i></div>' +
      '<span class="desc">' + desc + '</span>' +
      '<div class="chips"><span class="fa-chip ' + adapter + '">' + (adapter === 'claude' ? 'claude-code' : 'codex') + '</span><span class="fa-chip">' + model + '</span><span class="fa-chip">memory</span></div>';
    gridEl.appendChild(el);
  });

  /* ---------------- live counters ---------------- */
  let runsToday = 12, passed = 11, failed = 1, totalRuns = 20, okRuns = 19;
  let tokens = 48200, cost = 0.94;
  const fmtK = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  function paintStats(runningCount) {
    $('fa-today').textContent = runsToday;
    $('fa-runs').textContent = runsToday;
    $('fa-runs-sub').textContent = passed + ' passed · ' + (failed ? failed + ' failed' : '0 failed') + (runningCount ? ' · 1 running' : '');
    $('fa-tokens').textContent = fmtK(tokens);
    $('fa-cost').textContent = '$' + cost.toFixed(2) + ' today';
    const pct = Math.round((okRuns / totalRuns) * 100);
    $('fa-rate').textContent = pct + '%';
    $('fa-rate-sub').textContent = okRuns + '/' + totalRuns + ' runs';
    $('fa-donut-arc').style.strokeDashoffset = String(213.6 * (1 - pct / 100));
  }

  /* ---------------- recent activity ---------------- */
  const POOL = [
    ['task-manager', 'prioritize-tasks', '8 tasks scheduled based on today’s Slack and Jira signals', '4m 12s', 5200],
    ['odp-product-manager', 'slack-digest', 'Daily note updated — 3 high-priority items flagged', '1m 45s', 3100],
    ['site-monitor', 'uptime-check', 'All 12 endpoints healthy — all clear', '38s', 900],
    ['vault-librarian', 'vault-weekly-organize', '14 notes filed, 3 duplicates merged, links repaired', '6m 02s', 7800],
    ['odp-product-manager', 'jira-digest', '9 issues updated, 3 completed — digest written to daily note', '2m 30s', 4100],
    ['fleet-orchestrator', 'fleet-health', '5 agents healthy · memory consolidated overnight', '52s', 1400],
  ];
  const RUNNING_SNIPPETS = [
    'Reading memory — comparing with previous runs…',
    'Gathering Slack channels in parallel…',
    'Querying endpoints — 8/12 responded…',
    'Scanning vault for unlinked notes…',
    'Fetching Jira board — parsing sprint state…',
    'Checking run logs and heartbeat schedules…',
  ];
  const activityEl = $('fa-activity');
  const seedTimes = ['2:35 PM', '2:10 PM', '1:19 PM', '1:00 PM', '12:52 PM'];

  function runItem(agent, task, snippet, meta, live) {
    const el = document.createElement('div');
    el.className = 'fa-run ' + (live ? 'live' : 'ok');
    el.innerHTML =
      '<span class="fa-run-ic"></span>' +
      '<span class="fa-run-body"><span class="fa-run-title"><b>' + agent + '</b><span>' + task + '</span></span>' +
      '<span class="fa-run-snippet">' + snippet + '</span></span>' +
      '<span class="fa-run-meta">' + meta + '</span>';
    return el;
  }

  // seed with completed runs
  POOL.slice(0, 4).forEach((p, i) => activityEl.appendChild(runItem(p[0], p[1], p[2], seedTimes[i] + ' · ' + p[3])));

  /* ---------------- run simulation loop ---------------- */
  let poolIdx = 0;
  let simTimer = null;

  function simulateRun() {
    const p = POOL[poolIdx % POOL.length];
    const snippet = RUNNING_SNIPPETS[poolIdx % RUNNING_SNIPPETS.length];
    poolIdx++;

    const el = runItem(p[0], p[1], snippet, 'running', true);
    activityEl.prepend(el);
    while (activityEl.children.length > 4) activityEl.lastChild.remove();

    const dot = fleetDots[p[0]];
    if (dot) { dot.classList.remove('green'); dot.classList.add('amber'); }
    paintStats(1);

    setTimeout(() => {
      el.classList.remove('live');
      el.classList.add('ok');
      el.querySelector('.fa-run-snippet').textContent = p[2];
      el.querySelector('.fa-run-meta').textContent = 'now · ' + p[3];
      if (dot) { dot.classList.remove('amber'); dot.classList.add('green'); }

      runsToday++; passed++; totalRuns++; okRuns++;
      tokens += p[4]; cost += p[4] * 0.000018;
      todayHeight = Math.min(96, todayHeight + 5);
      bars[bars.length - 1].style.height = todayHeight + '%';
      paintStats(0);
    }, reduced ? 400 : 3200 + Math.random() * 1200);
  }

  /* ---------------- chat script ---------------- */
  const msgsEl = $('fa-msgs');
  const inputEl = $('fa-input');
  const placeholderEl = $('fa-placeholder');
  const SCRIPT = [
    ['u', 'What’s my fleet up to today?'],
    ['a', 'All <b>5 agents</b> are healthy — 12 runs so far, 95% success.\n<code>jira-digest</code> posts in 2 hours. Nothing needs your attention.'],
    ['u', 'Create an agent that watches HN for Obsidian mentions'],
    ['a', 'Done — created <b>hn-watcher</b> on Claude Code:\n• heartbeat every 2 hours\n• memory-backed dedup so you never see a repeat\n\nWant results posted to Slack?'],
    ['u', 'Yes, #obsidian-news'],
    ['a', 'Wired to <b>#obsidian-news</b>. First run is scheduled — you’ll get a digest within the hour.'],
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let chatRunning = false;

  async function typeIntoComposer(text) {
    placeholderEl.style.display = 'none';
    const span = document.createElement('span');
    inputEl.insertBefore(span, inputEl.querySelector('.fa-caret'));
    if (reduced) { span.textContent = text; await sleep(600); }
    else {
      for (const ch of text) {
        span.textContent += ch;
        await sleep(22 + Math.random() * 40);
        if (!chatRunning) break;
      }
      await sleep(350);
    }
    span.remove();
    placeholderEl.style.display = '';
  }

  function addMsg(cls, html) {
    const m = document.createElement('div');
    m.className = 'fa-msg ' + cls;
    m.innerHTML = html;
    msgsEl.appendChild(m);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return m;
  }

  async function streamAgent(html) {
    const m = addMsg('agent', '<span class="fa-typing"><i></i><i></i><i></i></span>');
    await sleep(reduced ? 300 : 1100 + Math.random() * 600);
    if (reduced) { m.innerHTML = html; msgsEl.scrollTop = msgsEl.scrollHeight; return; }
    // stream word-ish chunks while preserving markup: split on spaces outside tags
    m.innerHTML = '';
    const tokens = html.split(/(<[^>]+>|\s+)/).filter(Boolean);
    let acc = '';
    for (const t of tokens) {
      acc += t;
      m.innerHTML = acc;
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (!/^</.test(t)) await sleep(26);
      if (!chatRunning) return;
    }
  }

  async function chatLoop() {
    chatRunning = true;
    while (chatRunning) {
      msgsEl.innerHTML = '';
      let ctx = 22;
      for (const [who, text] of SCRIPT) {
        if (!chatRunning) return;
        if (who === 'u') {
          await sleep(900);
          await typeIntoComposer(text.replace(/<[^>]+>/g, ''));
          if (!chatRunning) return;
          addMsg('user', text);
        } else {
          await streamAgent(text);
          ctx += 9;
          $('fa-ctx-bar').style.width = ctx + '%';
          $('fa-ctx-pct').textContent = ctx + '%';
        }
        await sleep(reduced ? 400 : 1400);
      }
      await sleep(5000);
      $('fa-ctx-bar').style.width = '22%';
      $('fa-ctx-pct').textContent = '22%';
    }
  }

  /* ---------------- start / pause on visibility ---------------- */
  let started = false;

  function start() {
    if (started) return;
    started = true;
    // entrance animations
    requestAnimationFrame(() => {
      bars.forEach((b, i) => setTimeout(() => (b.style.height = heights[i] + '%'), i * 45));
      paintStats(0);
      $('fa-ctx-bar').style.width = '22%';
      $('fa-ctx-pct').textContent = '22%';
    });
    simTimer = setInterval(simulateRun, reduced ? 9000 : 7000);
    setTimeout(simulateRun, 2200);
    chatLoop();
  }

  function stop() {
    if (!started) return;
    started = false;
    chatRunning = false;
    clearInterval(simTimer);
  }

  const vis = new IntersectionObserver(
    (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
    { threshold: 0.15 }
  );
  vis.observe(app);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (app.getBoundingClientRect().top < innerHeight) start();
  });
})();
