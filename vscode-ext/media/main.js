/* CCLens webview client — plain JS on purpose: no build step, no
   dependencies, all rendering in-browser. Communicates with the extension
   host via postMessage. */
(() => {
	'use strict';
	const vscode = acquireVsCodeApi();
	const mode = document.body.dataset.mode;
	const content = document.getElementById('content');
	const refreshBtn = document.getElementById('refresh');

	const state = {summaries: [], detailShown: false};

	/* ---------- helpers ---------- */

	const esc = value =>
		String(value ?? '').replace(
			/[&<>"']/g,
			c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c],
		);

	const fmtCny = amount => {
		if (amount < 1) return `¥${amount.toFixed(3)}`;
		if (amount < 100) return `¥${amount.toFixed(2)}`;
		return `¥${amount.toFixed(1)}`;
	};

	const fmtTokens = tokens => {
		if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
		if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
		return String(tokens);
	};

	const fmtDate = iso => {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		const pad = n => String(n).padStart(2, '0');
		return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};

	const CHART_COLORS = [
		'var(--vscode-charts-blue)',
		'var(--vscode-charts-green)',
		'var(--vscode-charts-orange)',
		'var(--vscode-charts-purple)',
		'var(--vscode-charts-yellow)',
		'var(--vscode-charts-red)',
	];

	const LEVEL_TEXT = {ok: '正常', warn: '接近上限', over: '已超支'};
	const LEVEL_COLOR = {
		ok: 'var(--vscode-charts-green)',
		warn: 'var(--vscode-charts-orange)',
		over: 'var(--vscode-charts-red)',
	};

	function setRefreshing(active) {
		refreshBtn.disabled = active;
		refreshBtn.textContent = active ? '分析中…' : '⟳ 刷新';
	}

	/* ---------- dashboard ---------- */

	function budgetBarHtml(budget) {
		if (budget.limit <= 0) {
			return `<div class="budget-caption"><span>未设置月度预算</span><span>设置 cclens.monthlyBudget</span></div>`;
		}
		const width = Math.min(100, budget.ratio * 100);
		return `<div class="budget-bar"><div class="budget-fill" style="width:${width}%;background:${LEVEL_COLOR[budget.level]}"></div></div>
		<div class="budget-caption">
			<span>预算 ${fmtCny(budget.limit)}/月 · 已用 ${(budget.ratio * 100).toFixed(0)}%</span>
			<span class="tag ${budget.level}">${LEVEL_TEXT[budget.level]}</span>
		</div>`;
	}

	function trendHtml(payload) {
		const byDate = new Map(payload.byDate.map(d => [d.date, d.cost]));
		const days = [];
		const now = new Date();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			days.push({key, label: key.slice(5), cost: byDate.get(key) ?? 0, today: i === 0});
		}
		const maxCost = Math.max(...days.map(d => d.cost), 1);
		const cols = days
			.map(d => {
				const height = d.cost > 0 ? Math.max(8, (d.cost / maxCost) * 100) : 0;
				const value =
					d.cost > 0
						? d.cost < 10
							? `¥${d.cost.toFixed(1)}`
							: `¥${Math.round(d.cost)}`
						: '';
				return `<div class="tcol${d.today ? ' today' : ''}">
					<span class="tv">${value}</span>
					<div class="ttrack"><div class="tfill" style="height:${height}%"></div></div>
					<span class="td">${d.label}</span>
				</div>`;
			})
			.join('');
		return `<div class="trend-bars">${cols}</div>`;
	}

	function barRowsHtml(items, labelOf, colorOffset) {
		const maxCost = items[0].cost;
		return items
			.slice(0, 8)
			.map((item, i) => {
				const width = maxCost > 0 ? Math.max(2, (item.cost / maxCost) * 100) : 0;
				return `<div class="row">
					<span class="name" title="${esc(labelOf(item))}">${esc(labelOf(item))}</span>
					<span class="bar-track"><span class="bar-fill" style="width:${width}%;background:${CHART_COLORS[(i + colorOffset) % CHART_COLORS.length]}"></span></span>
					<span class="value"><b>${fmtCny(item.cost)}</b></span>
				</div>`;
			})
			.join('');
	}

	function dashboardHtml(payload, projectsDir, analyzedAt) {
		if (payload.sessionCount === 0) {
			return `<div class="empty">
				没有找到会话数据。<br>
				检查目录：<code>${esc(projectsDir)}</code><br>
				可在设置 <code>cclens.projectsDir</code> 中修改。
			</div>`;
		}

		const now = new Date();
		const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;
		const usage = payload.usage;
		const cacheRate = usage.input > 0 ? Math.round((usage.cacheRead / usage.input) * 100) : 0;

		let html = `<div class="card">
			<div class="hero-label">${monthLabel}成本</div>
			<div class="amount">${fmtCny(payload.monthly)}</div>
			<div class="meta">累计 ${fmtCny(payload.total)} · ${payload.sessionCount} 个会话 · ${payload.parsedMessageCount} 条消息 · 更新于 ${fmtDate(analyzedAt)}</div>
			<div class="meta">输入 ${fmtTokens(usage.input)} · 输出 ${fmtTokens(usage.output)} · 缓存读命中 ${cacheRate}%</div>
			${budgetBarHtml(payload.budget)}
		</div>`;

		if (payload.byModel.length > 0) {
			html += `<div class="card"><h3>按模型分布</h3>${barRowsHtml(payload.byModel, m => m.model, 0)}</div>`;
		}

		html += `<div class="card"><h3>近 7 天成本</h3>${trendHtml(payload)}</div>`;

		if (payload.byProject.length > 0) {
			html += `<div class="card"><h3>按项目排行</h3>${barRowsHtml(payload.byProject, p => p.project, 2)}</div>`;
		}

		return html;
	}

	/* ---------- summaries ---------- */

	function summariesHtml(items) {
		if (items.length === 0) {
			return `<div class="empty">
				还没有会话摘要。<br><br>
				摘要由 CCLens CLI 在会话退出时自动生成：在终端用 <code>cclens</code> 启动并结束会话后，这里会自动出现摘要。<br>
				生成功能需要配置 <code>CCLENS_LLM_API_KEY</code> 环境变量。<br><br>
				<button class="btn" id="openDir">打开摘要目录</button>
			</div>`;
		}
		return items
			.map(
				(item, i) => `<div class="summary-item" data-i="${i}">
				<div class="t">${esc(item.title)}</div>
				<div class="m">${esc(item.project || '未分类')} · ${fmtDate(item.generatedAt)} · ${item.whatWasDone.length} 项完成</div>
			</div>`,
			)
			.join('');
	}

	function summaryDetailHtml(item) {
		const sections = [
			{heading: '完成了什么', items: item.whatWasDone},
			{heading: '关键决策', items: item.keyDecisions},
			{heading: '下一步', items: item.nextSteps},
		]
			.filter(s => s.items && s.items.length > 0)
			.map(
				s =>
					`<h4>${s.heading}</h4><ul>${s.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`,
			)
			.join('');
		const fallback = sections ? '' : `<pre class="raw">${esc(item.raw)}</pre>`;
		return `<div class="detail">
			<h2>${esc(item.title)}</h2>
			<div class="m">${esc(item.project || '未分类')} · ${fmtDate(item.generatedAt)}</div>
			${sections || fallback}
		</div>`;
	}

	function renderSummaryList(items) {
		state.detailShown = false;
		content.innerHTML = `<div id="listView">${summariesHtml(items)}</div><div id="detailView" class="hidden"></div>`;
		content.dataset.rendered = '1';
		content.querySelectorAll('.summary-item').forEach(el => {
			el.addEventListener('click', () => showDetail(Number(el.dataset.i)));
		});
		const openDir = document.getElementById('openDir');
		if (openDir) {
			openDir.addEventListener('click', () => vscode.postMessage({type: 'openSummariesDir'}));
		}
	}

	function showDetail(i) {
		const item = state.summaries[i];
		if (!item) return;
		state.detailShown = true;
		const listView = content.querySelector('#listView');
		const detailView = content.querySelector('#detailView');
		listView.classList.add('hidden');
		detailView.classList.remove('hidden');
		detailView.innerHTML = `<div class="backlink" id="backLink">← 返回列表</div>${summaryDetailHtml(item)}`;
		document.getElementById('backLink').addEventListener('click', () => {
			listView.classList.remove('hidden');
			detailView.classList.add('hidden');
			state.detailShown = false;
		});
	}

	/* ---------- message handling ---------- */

	window.addEventListener('message', event => {
		const msg = event.data;
		if (!msg || typeof msg.type !== 'string') return;
		switch (msg.type) {
			case 'analyzing':
				setRefreshing(true);
				if (!content.dataset.rendered) {
					content.innerHTML = '<div class="empty">正在分析会话数据…</div>';
				}
				break;
			case 'dashboard':
				setRefreshing(false);
				content.innerHTML = dashboardHtml(msg.payload, msg.projectsDir, msg.analyzedAt);
				content.dataset.rendered = '1';
				break;
			case 'summaries':
				setRefreshing(false);
				state.summaries = msg.items || [];
				renderSummaryList(state.summaries);
				break;
			case 'error':
				setRefreshing(false);
				content.innerHTML = `<div class="error">⚠️ ${esc(msg.message || '未知错误').replace(/\n/g, '<br>')}</div>`;
				break;
		}
	});

	refreshBtn.addEventListener('click', () => {
		vscode.postMessage({type: mode === 'dashboard' ? 'refresh' : 'listSummaries'});
	});

	// Ask the extension host for initial data.
	vscode.postMessage({type: mode === 'dashboard' ? 'refresh' : 'listSummaries'});
})();
