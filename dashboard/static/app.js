// Global App State
let appData = {
    grievances: [],
    stats: {},
    currentTab: 'overview',
    selectedDepartment: 'Water Supply',
    sortKey: 'timestamp',
    sortAsc: false,
    batchResults: null
};

// Global Chart Instances
let charts = {};

// On DOM Loaded
document.addEventListener("DOMContentLoaded", () => {
    // Start Live Clock
    startClock();
    
    // Initial Data Fetch
    refreshData();
    
    // Setup File Drag & Drop Zones
    setupDragDrop();
});

// 1. Clock Logic
function startClock() {
    const clockEl = document.getElementById("live-clock");
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    }, 1000);
}

// 2. Tab Navigation
function switchTab(tabId) {
    // Update active tab buttons
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    const clickedTab = document.getElementById(`tab-${tabId}`);
    if (clickedTab) clickedTab.classList.add("active");
    
    // Update active view sections
    document.querySelectorAll(".dashboard-view").forEach(view => {
        view.classList.remove("active-view");
    });
    const activeView = document.getElementById(`view-${tabId}`);
    if (activeView) activeView.classList.add("active-view");
    
    // Update header title
    const titles = {
        'overview': 'Executive Overview',
        'sentiment': 'Urgency & Sentiment Dashboard',
        'classifier': 'AI Classification Center',
        'department': 'Departmental Performance Deep Dive'
    };
    const subtitles = {
        'overview': 'Real-time civic monitoring and triage command console.',
        'sentiment': 'Urgency levels and sentiment score analytics across grievances.',
        'classifier': 'Interact with natural language processing models for grievance routing.',
        'department': 'Performance indicators and resolution metrics per department.'
    };
    
    document.getElementById("page-title").textContent = titles[tabId];
    document.getElementById("page-description").textContent = subtitles[tabId];
    
    appData.currentTab = tabId;
    
    // Re-render views if needed
    if (tabId === 'department') {
        selectDeepDiveDepartment(appData.selectedDepartment);
    } else {
        renderGrievancesList();
    }
}

// 3. API Data Fetching
async function refreshData() {
    const startTime = performance.now();
    try {
        // Fetch stats
        const statsRes = await fetch('/stats');
        appData.stats = await statsRes.json();
        
        // Fetch full grievances list
        const grievancesRes = await fetch('/grievances');
        appData.grievances = await grievancesRes.json();
        
        // Calculate latency
        const endTime = performance.now();
        document.getElementById("api-latency").textContent = `Latency: ${(endTime - startTime).toFixed(0)} ms`;
        
        // Update stats metrics in UI
        updateMetricsUI();
        
        // Render Views
        renderGrievancesList();
        
        // Render Charts
        renderOverviewCharts();
        renderSentimentCharts();
        if (appData.currentTab === 'department') {
            renderDepartmentCharts();
        }
        
    } catch (err) {
        console.error("Error fetching dashboard data:", err);
        document.getElementById("api-latency").textContent = "API: OFFLINE";
    }
}

// Update KPI Metrics Cards
function updateMetricsUI() {
    const s = appData.stats;
    if (!s) return;
    
    document.getElementById("kpi-total").textContent = s.total || 0;
    document.getElementById("kpi-critical").textContent = s.critical_alerts || 0;
    
    const resolved = (s.by_status && s.by_status['Resolved']) || 0;
    document.getElementById("kpi-resolved").textContent = resolved;
    
    const resolutionRate = s.total > 0 ? ((resolved / s.total) * 100).toFixed(0) : 0;
    document.getElementById("kpi-resolved-percent").textContent = `${resolutionRate}% Rate`;
    
    const sentiment = s.average_sentiment !== undefined ? s.average_sentiment : 0.00;
    document.getElementById("kpi-sentiment").textContent = sentiment.toFixed(2);
    
    let sentimentLbl = 'Neutral';
    if (sentiment <= -0.5) sentimentLbl = 'Critical Negative';
    else if (sentiment < -0.15) sentimentLbl = 'Negative';
    else if (sentiment > 0.15) sentimentLbl = 'Positive';
    document.getElementById("kpi-sentiment-label").textContent = sentimentLbl;
}

// Render dynamic tables
function renderGrievancesList() {
    const tbodyOverview = document.querySelector("#table-overview-stream tbody");
    const tbodyQueue = document.getElementById("priority-queue-body");
    
    if (!tbodyOverview || !tbodyQueue) return;
    
    // Sort grievances
    let sortedGrievances = [...appData.grievances];
    sortedGrievances.sort((a, b) => {
        let valA = a[appData.sortKey];
        let valB = b[appData.sortKey];
        
        if (typeof valA === 'string') {
            return appData.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return appData.sortAsc ? (valA - valB) : (valB - valA);
        }
    });
    
    // 1. Render Stream (Latest 5)
    tbodyOverview.innerHTML = "";
    const latestFive = [...appData.grievances].slice(0, 5);
    if (latestFive.length === 0) {
        tbodyOverview.innerHTML = `<tr><td colspan="7" style="text-align:center;">No grievances logged in the system.</td></tr>`;
    } else {
        latestFive.forEach(g => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: #ffffff;">${g.id}</td>
                <td style="font-size: 12px;">${formatDate(g.timestamp)}</td>
                <td class="narrative-preview" title="${g.narrative}">${g.narrative}</td>
                <td><span class="badge badge-secondary">${g.department}</span></td>
                <td><span class="badge ${getUrgencyBadgeClass(g.urgency)}">${g.urgency}</span></td>
                <td class="${getStatusClass(g.status)}">${g.status}</td>
                <td><button class="btn btn-secondary btn-tag" onclick="viewGrievanceDetails('${g.id}')">View</button></td>
            `;
            tbodyOverview.appendChild(tr);
        });
    }
    
    // 2. Render Priority Queue (Filterable list)
    tbodyQueue.innerHTML = "";
    const filteredQueue = sortedGrievances.filter(g => {
        const searchInput = document.getElementById("filter-search").value.toLowerCase();
        const deptSelect = document.getElementById("filter-department").value;
        const urgSelect = document.getElementById("filter-urgency").value;
        
        const matchesSearch = !searchInput || g.narrative.toLowerCase().includes(searchInput) || g.id.toLowerCase().includes(searchInput);
        const matchesDept = !deptSelect || g.department === deptSelect;
        const matchesUrg = !urgSelect || g.urgency === urgSelect;
        
        return matchesSearch && matchesDept && matchesUrg;
    });
    
    if (filteredQueue.length === 0) {
        tbodyQueue.innerHTML = `<tr><td colspan="8" style="text-align:center;">No grievances matching current filters.</td></tr>`;
    } else {
        filteredQueue.forEach(g => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: #ffffff;">${g.id}</td>
                <td style="font-size: 12px; white-space: nowrap;">${formatDate(g.timestamp)}</td>
                <td class="narrative-preview" style="max-width: 240px;" title="${g.narrative}">${g.narrative}</td>
                <td><span class="badge badge-secondary">${g.department}</span></td>
                <td><span class="badge ${getUrgencyBadgeClass(g.urgency)}">${g.urgency}</span></td>
                <td style="font-variant-numeric: tabular-nums; font-weight: 600; color: ${getSentimentColor(g.sentiment)}">${g.sentiment.toFixed(3)}</td>
                <td class="${getStatusClass(g.status)}">${g.status}</td>
                <td><button class="btn btn-secondary btn-tag" onclick="viewGrievanceDetails('${g.id}')">Details</button></td>
            `;
            tbodyQueue.appendChild(tr);
        });
    }
}

// Utility styling functions
function getUrgencyBadgeClass(urgency) {
    if (urgency === 'Critical') return 'badge-danger';
    if (urgency === 'High') return 'badge-danger';
    if (urgency === 'Medium') return 'badge-warning';
    return 'badge-success';
}

function getStatusClass(status) {
    if (status === 'Resolved') return 'status-resolved';
    if (status === 'Pending') return 'status-pending';
    return 'status-investigating';
}

function getSentimentColor(sentiment) {
    if (sentiment <= -0.5) return 'var(--color-critical)';
    if (sentiment < -0.1) return '#fbbf24';
    if (sentiment > 0.1) return 'var(--color-resolved)';
    return 'var(--outline)';
}

function formatDate(isoString) {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Dynamic filters trigger
function applyGrievanceFilters() {
    renderGrievancesList();
}

// Sorter trigger
function sortGrievances(key) {
    if (appData.sortKey === key) {
        appData.sortAsc = !appData.sortAsc;
    } else {
        appData.sortKey = key;
        appData.sortAsc = true;
    }
    renderGrievancesList();
}

// 4. Chart Renderers
function renderOverviewCharts() {
    if (appData.currentTab !== 'overview') return;
    
    const s = appData.stats;
    if (!s || !s.by_department) return;
    
    const depts = ['Water Supply', 'Electricity', 'Roads & Transport', 'Sanitation', 'Public Safety'];
    const volumes = depts.map(d => s.by_department[d] || 0);
    
    // Department volume horizontal bar chart
    if (charts.deptDist) {
        charts.deptDist.data.datasets[0].data = volumes;
        charts.deptDist.update();
    } else {
        const ctx = document.getElementById('chart-department-distribution').getContext('2d');
        charts.deptDist = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: depts,
                datasets: [{
                    label: 'Grievance Volume',
                    data: volumes,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.45)', // Blue
                        'rgba(251, 191, 36, 0.45)', // Yellow
                        'rgba(168, 85, 247, 0.45)', // Purple
                        'rgba(236, 72, 153, 0.45)', // Pink
                        'rgba(14, 165, 233, 0.45)'  // Sky
                    ],
                    borderColor: [
                        '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#0ea5e9'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8d90a0', stepSize: 1 }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#e0e3e5', font: { weight: '600' } }
                    }
                }
            }
        });
    }
    
    // Volume & Sentiment Timeline
    // Group grievances by date offset to display activity trend
    const sortedTimeline = [...appData.grievances].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const dates = {};
    sortedTimeline.forEach(g => {
        const dateStr = new Date(g.timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
        dates[dateStr] = (dates[dateStr] || 0) + 1;
    });
    
    const datesList = Object.keys(dates);
    const volumeTimeline = Object.values(dates);
    
    if (charts.activityTrend) {
        charts.activityTrend.data.labels = datesList;
        charts.activityTrend.data.datasets[0].data = volumeTimeline;
        charts.activityTrend.update();
    } else {
        const ctx2 = document.getElementById('chart-activity-trend').getContext('2d');
        const fillGradient = ctx2.createLinearGradient(0, 0, 0, 240);
        fillGradient.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
        fillGradient.addColorStop(1, 'rgba(37, 99, 235, 0.0)');
        
        charts.activityTrend = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: datesList,
                datasets: [{
                    label: 'Logged Complaints',
                    data: volumeTimeline,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    backgroundColor: fillGradient,
                    pointBackgroundColor: '#b4c5ff',
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8d90a0' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8d90a0', stepSize: 2 }
                    }
                }
            }
        });
    }
}

function renderSentimentCharts() {
    if (appData.currentTab !== 'sentiment') return;
    
    const s = appData.stats;
    if (!s || !s.by_urgency) return;
    
    const urgencies = ['Critical', 'High', 'Medium', 'Low'];
    const counts = urgencies.map(u => s.by_urgency[u] || 0);
    
    // Urgency donut
    if (charts.urgencyDonut) {
        charts.urgencyDonut.data.datasets[0].data = counts;
        charts.urgencyDonut.update();
    } else {
        const ctx = document.getElementById('chart-urgency-donut').getContext('2d');
        charts.urgencyDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: urgencies,
                datasets: [{
                    data: counts,
                    backgroundColor: [
                        'rgba(231, 76, 60, 0.6)',  // Critical (Ruby)
                        'rgba(230, 126, 34, 0.6)', // High (Orange/Amber)
                        'rgba(241, 196, 15, 0.6)', // Medium (Amber)
                        'rgba(46, 204, 113, 0.6)'  // Low (Emerald)
                    ],
                    borderColor: [
                        '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71'
                    ],
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#e0e3e5', boxWidth: 12 }
                    }
                },
                cutout: '65%'
            }
        });
    }
    
    // Sentiment Distribution Histogram
    const buckets = {
        'Highly Neg [-1, -0.6]': 0,
        'Neg [-0.6, -0.2]': 0,
        'Neutral [-0.2, 0.2]': 0,
        'Pos [0.2, 0.6]': 0,
        'Highly Pos [0.6, 1]': 0
    };
    
    appData.grievances.forEach(g => {
        const val = g.sentiment;
        if (val <= -0.6) buckets['Highly Neg [-1, -0.6]']++;
        else if (val <= -0.2) buckets['Neg [-0.6, -0.2]']++;
        else if (val <= 0.2) buckets['Neutral [-0.2, 0.2]']++;
        else if (val <= 0.6) buckets['Pos [0.2, 0.6]']++;
        else buckets['Highly Pos [0.6, 1]']++;
    });
    
    const histogramLabels = Object.keys(buckets);
    const histogramData = Object.values(buckets);
    
    if (charts.sentimentHist) {
        charts.sentimentHist.data.datasets[0].data = histogramData;
        charts.sentimentHist.update();
    } else {
        const ctx2 = document.getElementById('chart-sentiment-distribution').getContext('2d');
        charts.sentimentHist = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: histogramLabels,
                datasets: [{
                    label: 'Count',
                    data: histogramData,
                    backgroundColor: [
                        'rgba(231, 76, 60, 0.55)',
                        'rgba(230, 126, 34, 0.55)',
                        'rgba(141, 144, 160, 0.55)',
                        'rgba(52, 211, 153, 0.55)',
                        'rgba(46, 204, 113, 0.55)'
                    ],
                    borderColor: [
                        '#e74c3c', '#e67e22', '#8d90a0', '#34d399', '#2ecc71'
                    ],
                    borderWidth: 1.5,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8d90a0', font: { size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8d90a0', stepSize: 2 }
                    }
                }
            }
        });
    }
}

// 5. Single Triage Execution
async function analyzeSingleGrievance() {
    const textInput = document.getElementById("single-text-input").value.trim();
    if (textInput.length < 5) {
        alert("Please enter a valid complaint text with at least 5 characters.");
        return;
    }
    
    const saveToDb = document.getElementById("single-save-db").checked;
    const btn = document.getElementById("btn-analyze-single");
    const originalHtml = btn.innerHTML;
    
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing Triage...`;
    btn.disabled = true;
    
    try {
        const res = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textInput, save_to_db: saveToDb })
        });
        
        if (!res.ok) throw new Error("API analysis failed");
        const analysis = await res.json();
        
        // Show result card
        const panel = document.getElementById("single-result-panel");
        panel.classList.remove("hidden");
        
        // Update Predictions UI
        document.getElementById("res-dept").textContent = analysis.department;
        document.getElementById("res-dept-conf").textContent = `Confidence: ${(analysis.dept_confidence * 100).toFixed(0)}%`;
        
        const urgEl = document.getElementById("res-urg");
        urgEl.textContent = analysis.urgency;
        urgEl.className = "meter-val"; // Reset
        if (analysis.urgency === 'Critical' || analysis.urgency === 'High') urgEl.classList.add("text-red");
        else if (analysis.urgency === 'Medium') urgEl.classList.add("text-yellow");
        else urgEl.classList.add("text-green");
        
        document.getElementById("res-urg-conf").textContent = `Confidence: ${(analysis.urg_confidence * 100).toFixed(0)}%`;
        
        // Sentiment range slider and values
        document.getElementById("res-sentiment-slider").value = (analysis.sentiment * 100).toFixed(0);
        document.getElementById("res-sentiment-val").textContent = analysis.sentiment.toFixed(3);
        
        // Token chips
        const tokensEl = document.getElementById("res-tokens");
        tokensEl.innerHTML = "";
        
        // Split clean text to tokens to display
        const stopwordFiltered = textInput.toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !STOPWORDS.has(w));
            
        if (stopwordFiltered.length === 0) {
            tokensEl.innerHTML = `<span style="font-size:11px;color:var(--outline);">No significant tokens extracted.</span>`;
        } else {
            stopwordFiltered.forEach(tok => {
                const span = document.createElement("span");
                span.className = "token-chip";
                span.textContent = tok;
                tokensEl.appendChild(span);
            });
        }
        
        // Refresh full data to update grid lists and charts
        refreshData();
        
    } catch (e) {
        console.error(e);
        alert("An error occurred during single grievance analysis.");
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

// 6. Batch Analysis Execution
let batchTab = 'csv';
function switchBatchTab(tab) {
    document.querySelectorAll(".batch-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.getElementById(`btn-tab-${tab}`).classList.add("active");
    
    document.querySelectorAll(".batch-panel").forEach(p => p.classList.remove("active-panel"));
    document.getElementById(`batch-panel-${tab}`).classList.add("active-panel");
    
    batchTab = tab;
}

// Drag & drop handlers
let uploadedCsvFileContent = "";
let uploadedCsvFileName = "";
let uploadedCsvFileSize = 0;

function setupDragDrop() {
    const dropZone = document.getElementById("drag-drop-zone");
    if (!dropZone) return;
    
    dropZone.addEventListener("click", () => {
        document.getElementById("batch-csv-file").click();
    });
    
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });
    
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            readCsvFile(e.dataTransfer.files[0]);
        }
    });
}

function handleCsvSelect(e) {
    if (e.target.files.length > 0) {
        readCsvFile(e.target.files[0]);
    }
}

function readCsvFile(file) {
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        alert("Please upload a valid CSV document.");
        return;
    }
    
    uploadedCsvFileName = file.name;
    uploadedCsvFileSize = (file.size / 1024).toFixed(1);
    
    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedCsvFileContent = event.target.result;
        
        // Update UI info
        document.getElementById("drag-drop-zone").style.display = "none";
        const fileBar = document.getElementById("file-info-bar");
        fileBar.classList.remove("hidden");
        document.getElementById("csv-filename").textContent = uploadedCsvFileName;
        document.getElementById("csv-filesize").textContent = `${uploadedCsvFileSize} KB`;
    };
    reader.readAsText(file);
}

function resetCsvUpload() {
    uploadedCsvFileContent = "";
    uploadedCsvFileName = "";
    uploadedCsvFileSize = 0;
    
    document.getElementById("drag-drop-zone").style.display = "block";
    document.getElementById("file-info-bar").classList.add("hidden");
    document.getElementById("batch-csv-file").value = "";
}

// Parse CSV simple logic helper
function parseCsvNarratives(csvText) {
    const lines = csvText.split(/\r?\n/).map(line => line.trim());
    if (lines.length === 0) return [];
    
    // Find narrative column index
    const headers = lines[0].toLowerCase().split(",").map(h => h.replace(/["']/g, '').trim());
    let columnIdx = headers.findIndex(h => h.includes("narrative") || h.includes("complaint") || h.includes("text") || h.includes("description"));
    
    if (columnIdx === -1) {
        // Fallback to first column
        columnIdx = 0;
    }
    
    const list = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        
        // Simple CSV splitter (handle commas inside quotes)
        const row = parseCsvRow(lines[i]);
        if (row && row[columnIdx]) {
            list.push(row[columnIdx].replace(/["']/g, '').trim());
        }
    }
    return list;
}

function parseCsvRow(text) {
    let result = [];
    let insideQuote = false;
    let entry = "";
    
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"' || char === "'") {
            insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
            result.push(entry);
            entry = "";
        } else {
            entry += char;
        }
    }
    result.push(entry);
    return result;
}

// Execute Batch analysis
async function runBatchAnalysis() {
    let complaints = [];
    
    if (batchTab === 'csv') {
        if (!uploadedCsvFileContent) {
            alert("Please upload a CSV file containing grievances.");
            return;
        }
        complaints = parseCsvNarratives(uploadedCsvFileContent);
        if (complaints.length === 0) {
            alert("Could not extract any narrative complaints from the CSV column.");
            return;
        }
    } else {
        const text = document.getElementById("batch-manual-input").value.trim();
        complaints = text.split("\n").map(l => l.trim()).filter(l => l.length >= 5);
        if (complaints.length === 0) {
            alert("Please enter at least one grievance text narrative.");
            return;
        }
    }
    
    const saveToDb = document.getElementById("batch-save-db").checked;
    const btn = document.getElementById("btn-run-batch");
    const originalText = btn.innerHTML;
    
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing ${complaints.length} Records...`;
    btn.disabled = true;
    
    try {
        const res = await fetch('/batch-analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complaints: complaints, save_to_db: saveToDb })
        });
        
        if (!res.ok) throw new Error("Batch API analysis failed");
        const batchRes = await res.json();
        
        appData.batchResults = batchRes.results;
        
        // Show result details
        const panel = document.getElementById("batch-results-panel");
        panel.classList.remove("hidden");
        
        document.getElementById("batch-stat-total").textContent = batchRes.total;
        
        const criticalCount = (batchRes.summary.by_urgency['Critical'] || 0) + (batchRes.summary.by_urgency['High'] || 0);
        document.getElementById("batch-stat-critical").textContent = criticalCount;
        
        document.getElementById("batch-stat-sentiment").textContent = batchRes.summary.average_sentiment.toFixed(3);
        
        // Refresh statistics
        refreshData();
        
    } catch (e) {
        console.error(e);
        alert("An error occurred during batch analysis.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Download CSV Report
function downloadBatchResults() {
    if (!appData.batchResults || appData.batchResults.length === 0) {
        alert("No batch results to export.");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,Complaint ID,Narrative,Department,Urgency,Sentiment Score,Status\n";
    
    appData.batchResults.forEach((r, idx) => {
        const safeNarrative = r.narrative.replace(/"/g, '""');
        csvContent += `GRV-B${idx+101},"${safeNarrative}",${r.department},${r.urgency},${r.sentiment},${r.status}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "civic_sentinel_batch_triage_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 7. Department Deep-Dive logic
function selectDeepDiveDepartment(deptName) {
    appData.selectedDepartment = deptName;
    
    // Update active tab buttons UI
    document.querySelectorAll(".dept-tab").forEach(tab => tab.classList.remove("active"));
    
    const tabMap = {
        'Water Supply': 'dept-btn-water',
        'Electricity': 'dept-btn-electricity',
        'Roads & Transport': 'dept-btn-roads',
        'Sanitation': 'dept-btn-sanitation',
        'Public Safety': 'dept-btn-safety'
    };
    
    document.getElementById(tabMap[deptName]).classList.add("active");
    
    // Update titles
    document.getElementById("dept-activity-chart-title").textContent = `${deptName} - Complaint Frequency`;
    document.getElementById("dept-mix-chart-title").textContent = `${deptName} - Urgency Mix`;
    document.getElementById("dept-table-title").textContent = `${deptName} - Grievance Records`;
    
    // Calculate department stats
    const deptGrievances = appData.grievances.filter(g => g.department === deptName);
    
    const volume = deptGrievances.length;
    document.getElementById("kpi-dept-volume").textContent = volume;
    
    const totalVolume = appData.grievances.length;
    const volPct = totalVolume > 0 ? ((volume / totalVolume) * 100).toFixed(1) : 0;
    document.getElementById("kpi-dept-vol-pct").textContent = `${volPct}% of total`;
    
    let totalSentiment = 0.0;
    let urgentCount = 0;
    deptGrievances.forEach(g => {
        totalSentiment += g.sentiment;
        if (g.urgency === 'Critical' || g.urgency === 'High') {
            urgentCount++;
        }
    });
    
    const avgSentiment = volume > 0 ? (totalSentiment / volume) : 0.0;
    document.getElementById("kpi-dept-sentiment").textContent = avgSentiment.toFixed(3);
    
    let sentimentLbl = 'Neutral';
    if (avgSentiment <= -0.5) sentimentLbl = 'Critical Negative';
    else if (avgSentiment < -0.15) sentimentLbl = 'Negative';
    else if (avgSentiment > 0.15) sentimentLbl = 'Positive';
    document.getElementById("kpi-dept-sentiment-label").textContent = sentimentLbl;
    
    const escalationRatio = volume > 0 ? ((urgentCount / volume) * 100).toFixed(0) : 0;
    document.getElementById("kpi-dept-escalation").textContent = `${escalationRatio}%`;
    document.getElementById("kpi-dept-escalated-count").textContent = `${urgentCount} High Tiers`;
    
    // Render deep dive table
    const tbody = document.getElementById("table-dept-grievances-body");
    tbody.innerHTML = "";
    
    if (deptGrievances.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No records currently assigned to this department.</td></tr>`;
    } else {
        deptGrievances.forEach(g => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: #ffffff;">${g.id}</td>
                <td style="font-size: 12px; white-space: nowrap;">${formatDate(g.timestamp)}</td>
                <td class="narrative-preview" title="${g.narrative}">${g.narrative}</td>
                <td><span class="badge ${getUrgencyBadgeClass(g.urgency)}">${g.urgency}</span></td>
                <td style="font-variant-numeric: tabular-nums; font-weight: 600; color: ${getSentimentColor(g.sentiment)}">${g.sentiment.toFixed(3)}</td>
                <td class="${getStatusClass(g.status)}">${g.status}</td>
                <td><button class="btn btn-secondary btn-tag" onclick="viewGrievanceDetails('${g.id}')">Details</button></td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Render deep dive charts
    renderDepartmentCharts(deptName, deptGrievances);
}

function renderDepartmentCharts(deptName, deptGrievances) {
    if (!deptGrievances) {
        deptGrievances = appData.grievances.filter(g => g.department === appData.selectedDepartment);
    }
    
    // Timeline Frequency
    const sorted = [...deptGrievances].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
    const dates = {};
    sorted.forEach(g => {
        const dateStr = new Date(g.timestamp).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
        dates[dateStr] = (dates[dateStr] || 0) + 1;
    });
    
    const datesList = Object.keys(dates);
    const volumeTimeline = Object.values(dates);
    
    if (charts.deptActivity) {
        charts.deptActivity.data.labels = datesList;
        charts.deptActivity.data.datasets[0].data = volumeTimeline;
        charts.deptActivity.update();
    } else {
        const ctx = document.getElementById('chart-department-activity').getContext('2d');
        const fillGradient = ctx.createLinearGradient(0, 0, 0, 240);
        fillGradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
        fillGradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
        
        charts.deptActivity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: datesList,
                datasets: [{
                    label: 'Complaints frequency',
                    data: volumeTimeline,
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    backgroundColor: fillGradient,
                    pointBackgroundColor: '#b4c5ff',
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#8d90a0' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#8d90a0', stepSize: 1 }
                    }
                }
            }
        });
    }
    
    // Urgency Mix doughnut
    const urgencies = ['Critical', 'High', 'Medium', 'Low'];
    const mixCounts = urgencies.map(u => deptGrievances.filter(g => g.urgency === u).length);
    
    if (charts.deptMix) {
        charts.deptMix.data.datasets[0].data = mixCounts;
        charts.deptMix.update();
    } else {
        const ctx2 = document.getElementById('chart-department-mix').getContext('2d');
        charts.deptMix = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: urgencies,
                datasets: [{
                    data: mixCounts,
                    backgroundColor: [
                        'rgba(231, 76, 60, 0.6)',
                        'rgba(230, 126, 34, 0.6)',
                        'rgba(241, 196, 15, 0.6)',
                        'rgba(46, 204, 113, 0.6)'
                    ],
                    borderColor: [
                        '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71'
                    ],
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#e0e3e5', boxWidth: 12 }
                    }
                },
                cutout: '65%'
            }
        });
    }
}

// 8. Triage Details Modal Logic
let currentViewingGrievanceId = null;

function viewGrievanceDetails(gId) {
    const g = appData.grievances.find(item => item.id === gId);
    if (!g) return;
    
    currentViewingGrievanceId = gId;
    
    document.getElementById("modal-g-id").textContent = `Grievance ID: ${g.id}`;
    document.getElementById("modal-g-time").textContent = `Submitted: ${formatDate(g.timestamp)}`;
    document.getElementById("modal-g-narrative").textContent = g.narrative;
    document.getElementById("modal-g-dept").textContent = g.department;
    document.getElementById("modal-g-dept-conf").textContent = `Conf: ${(g.dept_confidence * 100).toFixed(0)}%`;
    
    const urgEl = document.getElementById("modal-g-urg");
    urgEl.textContent = g.urgency;
    urgEl.className = "val"; // Reset
    if (g.urgency === 'Critical' || g.urgency === 'High') urgEl.classList.add("text-red");
    else if (g.urgency === 'Medium') urgEl.classList.add("text-yellow");
    else urgEl.classList.add("text-green");
    
    document.getElementById("modal-g-urg-conf").textContent = `Conf: ${(g.urg_confidence * 100).toFixed(0)}%`;
    
    const sentimentEl = document.getElementById("modal-g-sentiment");
    sentimentEl.textContent = g.sentiment.toFixed(3);
    sentimentEl.style.color = getSentimentColor(g.sentiment);
    
    // Set status select value
    document.getElementById("modal-g-status-select").value = g.status;
    
    // Show Modal
    document.getElementById("details-modal").classList.remove("hidden");
}

function closeModal() {
    document.getElementById("details-modal").classList.add("hidden");
    currentViewingGrievanceId = null;
}

// Update grievance status in the backend
async function updateGrievanceStatusFromModal() {
    if (!currentViewingGrievanceId) return;
    
    const newStatus = document.getElementById("modal-g-status-select").value;
    
    try {
        const res = await fetch(`/grievances/${currentViewingGrievanceId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!res.ok) throw new Error("Failed to update status");
        
        // Refresh local data state
        refreshData();
        
    } catch (err) {
        console.error(err);
        alert("Could not update grievance status on server.");
    }
}

// 9. Quick Demo Template Fill
const demoTexts = [
    "A live electrical wire has fallen near the primary school playground. Sparks are flying, children are running. DANGER OF ELECTROCUTION!!!",
    "We have had no running water supply since 8 days. Taps are completely dry. Five complaints were filed but nothing done. Residents are suffering.",
    "Massive potholes on the main highway are causing vehicle damage. Several bike riders fell and got injured this week. Needs asphalt repair.",
    "The community garbage bin at the corner of sector 4 is overflowing. Garbage is scattered on the street attracting rats and smell is unbearable."
];

function fillDemo(idx) {
    document.getElementById("single-text-input").value = demoTexts[idx];
}

// Preprocessed stopwords set helper
const STOPWORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
    'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
    'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in',
    'into', 'is', 'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
    'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that',
    'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd',
    'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
    'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres',
    'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd',
    'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);
